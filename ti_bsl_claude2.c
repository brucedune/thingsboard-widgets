///////////////////////////////////////////////////////////////////////////////
//
// DUNE LABS CONFIDENTIAL
// ======================
//
//  Copyright 2024 - Dune Labs Incorporated
//
//  All Rights Reserved.
//
// NOTICE:
// All information contained herein is, and remains the property of Dune
// Labs Incorporated. The intellectual and technical concepts contained
// herein are proprietary to Dune Labs Incorporated and may be covered by
// U.S. and Foreign Patents, patents in process, and are protected by trade
// secret or copyright law. Dissemination of this information or reproduction
// of this material is strictly forbidden unless prior written permission is
// obtained from Dune Labs Incorporated.
//
///////////////////////////////////////////////////////////////////////////////

// MSP430FR6047 firmware flashing driver

/** @file ti_bsl.c */

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#include "main.h"
#include "checksum.h"
#include "ti_bsl.h"
#include "ti_fota.h"
#include "hci_st.h"
#include "uart.h"
#include "hci.h"

#define BSL_HEADER                         0x80U

/* ----------------------------- BSL timing -------------------------------- */

#define BSL_DEFAULT_BAUD                  9600U
#define BSL_FAST_BAUD                     57600U
#define BSL_BAUD_SELECT_57600             5U

#define BSL_SEND_GUARD_MS                 3U
#define BSL_ACK_TIMEOUT_MS                300U
#define BSL_HDR_TIMEOUT_MS                300U
#define BSL_FRAME_TIMEOUT_MS              500U
#define BSL_UART_FLUSH_MS                 50U

#define BSL_ENTRY_PRE_LOW_MS              5U
#define BSL_ENTRY_FIRST_HIGH_US           150U
#define BSL_ENTRY_GAP_US                  50U
#define BSL_ENTRY_POST_MS                 5U
#define BSL_ENTRY_SETTLE_MS               10U

#define BSL_POST_RESET_MS                 100U   /* BOR recovery + BSL ROM init settle */
#define BSL_MASS_ERASE_WAIT_MS            300U
#define BSL_UNLOCK_RETRIES                9U
#define BSL_WRITE_RETRIES                 5U
#define BSL_POST_UNLOCK_DELAY_MS          5U
#define BSL_POST_BAUD_SWITCH_DELAY_MS     5U
#define BSL_POST_VERSION_DELAY_MS         5U
#define BSL_WRITE_GUARD_US                1250U
#define BSL_CRC_GUARD_US                  1250U
#define BSL_CRC_ERROR_WAIT_MS             50U

/* Response packet lengths */
#define BSL_PASSWD_RSP_LEN                8U
#define BSL_VERSION_RSP_LEN               11U
#define BSL_CRC_RSP_LEN                   9U

/* ---------------------------- Reset timing ------------------------------- */

#define TI_USE_SOFT_RESET                 1

#define TI_SOFT_RESET_LOW_MS              250U
#define TI_SOFT_BOOT_WAIT_MS              10000U /* 10s: allow extra margin for new firmware init after FOTA */

#define TI_HARD_RESET_OFF_MS              500U   /* VS1 power-off hold time */
#define TI_HARD_RESET_BOOT_WAIT_MS        10000U /* wait for TI boot after power cycle */

/* --------------------------- Protocol values ----------------------------- */

typedef enum
{
	BSL_RX_DATA_BLOCK    = 0x10,  /* Standard write (works at any baud) */
	BSL_RX_PASSWD        = 0x11,
	BSL_MASS_ERASE       = 0x15,
	BSL_CRC_CHECK        = 0x16,
	BSL_TX_VERSION       = 0x19,
	BSL_RX_DATAFAST      = 0x1B,  /* Fast write (requires 57600 baud) */
	BSL_TX_DATA_BLOCK_R  = 0x3A,  /* Read data block response */
	BSL_CORE_MSG         = 0x3B,
	BSL_CHANGE_BAUD_RATE = 0x52,
} BSL_Cmd_Byte;

typedef enum
{
	BSL_ACK = 0x00,
	BSL_HEADER_INCORRECT = 0x51,
	BSL_CHECKSUM_INCORRECT,
	BSL_PACKET_SIZE_ZERO,
	BSL_PACKET_SIZE_EXCEEDS_BUFFER,
	BSL_UNKNOWN,
	BSL_UNKNOWN_BAUD_RATE,
	BSL_PACKET_SIZE_ERROR
} ACK_Status;

/** For BSL Core Response */
typedef enum
{
	COREMSG_SUCCESS          = 0,
	COREMSG_WRITE_CHECK_FAIL = 1,
	COREMSG_LOCKED           = 4,
	COREMSG_PASSWD_ERR       = 5,
	COREMSG_UNKNOWN_CMD      = 7
} Core_Message;

typedef enum
{
	BSL_INIT_OK = 0,
	BSL_INIT_UNLOCK_FAIL,
	BSL_INIT_BAUD_FAIL,
	BSL_INIT_VERSION_FAIL
} BSL_Init_Status;

/* ---------------------------- Packet structs ----------------------------- */

typedef struct __attribute__((packed))
{
	uint8_t al;
	uint8_t am;
	uint8_t ah;
}
BSL_Addr;

typedef union
{
	BSL_Addr split;
	uint32_t uint;
} BSL_Addr_Union;

typedef union
{
	struct __attribute__((packed))
	{
		BSL_Cmd_Byte cmd;
		BSL_Addr addr;
		uint8_t data[];
	} core_cmd;

	struct __attribute__((packed))
	{
		BSL_Cmd_Byte cmd;
		uint8_t data[];
	} core_cmd_no_addr;
} BSL_Core_Cmd;

typedef struct __attribute__((packed))
{
	uint8_t header;
	uint16_t len;
	BSL_Core_Cmd core_cmd;
}
BSL_Cmd;

typedef struct __attribute__((packed))
{
	BSL_Cmd_Byte cmd;
	uint8_t data[];
}
BSL_Core_Res;

typedef struct __attribute__((packed))
{
	ACK_Status ack;
	uint8_t header;
	uint16_t len;
	BSL_Core_Res core_res;
}
BSL_Res;

union BSL_Packet
{
	BSL_Cmd cmd;
	BSL_Res res;
	uint8_t buf[280];
};

typedef union
{
	struct
	{
		uint8_t ckl;
		uint8_t ckh;
	};
	uint16_t ck;
} CK_Combined;

typedef struct __attribute__((packed))
{
	uint32_t addr;
	uint16_t len;
}
Chunk;

/* ------------------------------ Globals ---------------------------------- */

TI_FOTA_State ti_fota_state;

static union BSL_Packet bsl_data;
static uint8_t rtemp[261];

volatile bool gFotaReset = false;
volatile bool gGotTrigger = false;
static bool bsl_fast_baud = false;  /* true if 57600 baud change succeeded */
volatile uint32_t gResetReleaseTick = 0;
volatile uint32_t gTriggerTick = 0;

/* ---------------------------- Debug helpers ------------------------------ */

static const char *getACK_Status(ACK_Status in)
{
	switch (in)
	{
		case BSL_ACK:
			return "ACK";

		case BSL_HEADER_INCORRECT:
			return "HEADER_INCORRECT";

		case BSL_CHECKSUM_INCORRECT:
			return "CHECKSUM_INCORRECT";

		case BSL_PACKET_SIZE_ZERO:
			return "PACKET_SIZE_ZERO";

		case BSL_PACKET_SIZE_EXCEEDS_BUFFER:
			return "PACKET_SIZE_EXCEEDS_BUFFER";

		case BSL_UNKNOWN:
			return "UNKNOWN";

		case BSL_UNKNOWN_BAUD_RATE:
			return "UNKNOWN_BAUD_RATE";

		case BSL_PACKET_SIZE_ERROR:
			return "PACKET_SIZE_ERROR";

		default:
			return NULL;
	}
}

static const char *getCore_Message(Core_Message in)
{
	switch (in)
	{
		case COREMSG_SUCCESS:
			return "SUCCESS";

		case COREMSG_WRITE_CHECK_FAIL:
			return "WRITE_CHECK_FAIL";

		case COREMSG_LOCKED:
			return "LOCKED";

		case COREMSG_PASSWD_ERR:
			return "PASSWD_ERR";

		case COREMSG_UNKNOWN_CMD:
			return "UNKNOWN_CMD";

		default:
			return NULL;
	}
}

/* ----------------------------- Public helper ----------------------------- */

uint8_t *bslgetbuf(void)
{
	return bsl_data.buf;
}

/* --------------------------- Internal helpers ---------------------------- */

static void ti_ctrl_pins_output_mode(void)
{
	LL_GPIO_SetPinMode(GPIOB, JTAG_TEST_Pin, LL_GPIO_MODE_OUTPUT);
	LL_GPIO_SetPinMode(GPIOB, JTAG_RESET_Pin, LL_GPIO_MODE_OUTPUT);
}

static void ti_ctrl_pins_normal_run_state(void)
{
	ti_ctrl_pins_output_mode();

	/* Keep TI powered, TEST low, RESET released */
	HAL_GPIO_WritePin(EN_VS1_GPIO_Port, EN_VS1_Pin, GPIO_PIN_SET);
	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_SET);
}

#define SPI_MOSI_Pin  GPIO_PIN_7
#define SPI_MOSI_GPIO_Port GPIOA

extern SPI_HandleTypeDef hspi1;

/*
 * Float TI-facing SPI pins before VS1 power-off.
 * Only TI is behind the VS1 analog switch — ST and SPI flash are on VBATT.
 * Floating the shared bus lines prevents back-powering the TI through its
 * ESD protection diodes while VS1 is off.
 * Flash CS and HOLD stay driven HIGH (flash is still powered on VBATT).
 */
static void spi_bus_pins_safe_for_power_off(void)
{
	/* Deselect TI before floating */
	HAL_GPIO_WritePin(TI_SPI_CS_GPIO_Port, TI_SPI_CS_Pin, GPIO_PIN_SET);

	/* Keep flash CS and HOLD driven HIGH — flash is still powered */
	HAL_GPIO_WritePin(FLASH_CS_GPIO_Port, FLASH_CS_Pin, GPIO_PIN_SET);
	HAL_GPIO_WritePin(FLASH_HOLD_GPIO_Port, FLASH_HOLD_Pin, GPIO_PIN_SET);

	/* Float shared bus lines + TI CS only */
	LL_GPIO_SetPinMode(SPI_SCLK_GPIO_Port, SPI_SCLK_Pin, LL_GPIO_MODE_ANALOG);
	LL_GPIO_SetPinMode(SPI_MISO_GPIO_Port, SPI_MISO_Pin, LL_GPIO_MODE_ANALOG);
	LL_GPIO_SetPinMode(SPI_MOSI_GPIO_Port, SPI_MOSI_Pin, LL_GPIO_MODE_ANALOG);
	LL_GPIO_SetPinMode(TI_SPI_CS_GPIO_Port, TI_SPI_CS_Pin, LL_GPIO_MODE_ANALOG);
}

/* Restore SPI bus after VS1 power-on (flash never lost power) */
static void spi_bus_pins_restore(void)
{
	/* Re-init SPI1 peripheral — reconfigures SCLK/MISO/MOSI as AF */
	HAL_SPI_DeInit(&hspi1);
	HAL_SPI_Init(&hspi1);

	/* TI CS back to output, deselected */
	LL_GPIO_SetPinMode(TI_SPI_CS_GPIO_Port, TI_SPI_CS_Pin, LL_GPIO_MODE_OUTPUT);
	HAL_GPIO_WritePin(TI_SPI_CS_GPIO_Port, TI_SPI_CS_Pin, GPIO_PIN_SET);
}

static void uart_flush_rx(USART_TypeDef *uart)
{
	uint32_t start = HAL_GetTick();

	while ((HAL_GetTick() - start) < BSL_UART_FLUSH_MS && uart_readbyte_noblock(uart) != -1)
	{
		/* drain */
	}

	if (LL_USART_IsActiveFlag_ORE(uart))
	{
		LL_USART_ClearFlag_ORE(uart);
	}

	if (LL_USART_IsActiveFlag_NE(uart))
	{
		LL_USART_ClearFlag_NE(uart);
	}

	if (LL_USART_IsActiveFlag_FE(uart))
	{
		LL_USART_ClearFlag_FE(uart);
	}

	if (LL_USART_IsActiveFlag_PE(uart))
	{
		LL_USART_ClearFlag_PE(uart);
	}

	if (LL_USART_IsActiveFlag_IDLE(uart))
	{
		LL_USART_ClearFlag_IDLE(uart);
	}
}

static void bsl_clear_state(void)
{
	uart_flush_rx(USART3);
	memset(&bsl_data, 0, sizeof(bsl_data));
	memset(rtemp, 0, sizeof(rtemp));
}

static void build_cmd_noaddr(uint8_t cmd, uint16_t len, const void *data)
{
	bsl_data.cmd.header = BSL_HEADER;
	bsl_data.cmd.len = len + sizeof(bsl_data.cmd.core_cmd.core_cmd_no_addr);
	bsl_data.cmd.core_cmd.core_cmd_no_addr.cmd = (BSL_Cmd_Byte)cmd;

	if (len && data != NULL)
	{
		memcpy(bsl_data.cmd.core_cmd.core_cmd_no_addr.data, data, len);
	}

	CK_Combined ck;
	ck.ck = crc_ccitt_ffff(
	            (const unsigned char *)&bsl_data.cmd.core_cmd.core_cmd_no_addr,
	            len + sizeof(bsl_data.cmd.core_cmd.core_cmd_no_addr));

	bsl_data.cmd.core_cmd.core_cmd_no_addr.data[len]     = ck.ckl;
	bsl_data.cmd.core_cmd.core_cmd_no_addr.data[len + 1] = ck.ckh;

	//DBG_PRINTF("built cmd(0x%02X) core length %d\r\n", cmd, bsl_data.cmd.len);
}

static void build_cmd(uint8_t cmd, uint16_t len, uint32_t addr, const void *data)
{
	BSL_Addr_Union addr_u;
	addr_u.uint = addr;

	bsl_data.cmd.header = BSL_HEADER;
	bsl_data.cmd.len = len + sizeof(bsl_data.cmd.core_cmd.core_cmd);
	bsl_data.cmd.core_cmd.core_cmd.cmd = (BSL_Cmd_Byte)cmd;

	memcpy(&bsl_data.cmd.core_cmd.core_cmd.addr, &addr_u.split, sizeof(addr_u.split));

	if (len && data != NULL)
	{
		memcpy(bsl_data.cmd.core_cmd.core_cmd.data, data, len);
	}

	CK_Combined ck;
	ck.ck = crc_ccitt_ffff(
	            (const unsigned char *)&bsl_data.cmd.core_cmd.core_cmd,
	            len + sizeof(bsl_data.cmd.core_cmd.core_cmd));

	bsl_data.cmd.core_cmd.core_cmd.data[len]     = ck.ckl;
	bsl_data.cmd.core_cmd.core_cmd.data[len + 1] = ck.ckh;

	//DBG_PRINTF("built cmd(0x%02X) core length %d\r\n", cmd, bsl_data.cmd.len);
}

static void send_cmd(void)
{
	uint16_t len = bsl_data.cmd.len
	               + sizeof(BSL_Cmd)
	               - sizeof(BSL_Core_Cmd)
	               + sizeof(CK_Combined);

	HAL_Delay(BSL_SEND_GUARD_MS);

	int stat = uart_write(USART3, bsl_data.buf, len);

	if (stat != (int)len)
	{
		//DBG_PRINTF("send_cmd %d/%d\r\n", stat, len);
	}
}

static ACK_Status recv_ack(void)
{
	_Static_assert(sizeof(ACK_Status) == 1, "wrong size enum");
	_Static_assert(sizeof(BSL_Cmd_Byte) == 1, "wrong size enum");

	ACK_Status stat;
	int s = uart_read_timeout(USART3, &stat, 1, BSL_ACK_TIMEOUT_MS);

	if (s != 1)
	{
		DBG_PRINTF("ti_bsl: recv_ack timeout\r\n");
		stat = BSL_UNKNOWN;
	}

	const char *statstr = getACK_Status(stat);
	DBG_PRINTF("got ACK ");

	if (statstr != NULL)
	{
		DBG_PRINTF("%s\r\n", statstr);
	}
	else
	{
		DBG_PRINTF("%02x\r\n", stat);
	}

	return stat;
}

static ACK_Status recv2(uint16_t len)
{
	ACK_Status s = recv_ack();

	if (s != BSL_ACK)
	{
		return s;
	}

	uint8_t header = 0;
	int nbread = uart_read_timeout(USART3, &header, 1, BSL_HDR_TIMEOUT_MS);

	if (nbread != 1 || header != BSL_HEADER)
	{
		DBG_PRINTF("recv failed: missing header\r\n");
		return BSL_HEADER_INCORRECT;
	}

	len -= 2U;

	nbread = uart_read_timeout(USART3, rtemp, len, BSL_FRAME_TIMEOUT_MS);

	if (nbread != (int)len)
	{
		DBG_PRINTF("uart recv timeout got %d/%d bytes\r\n", nbread, len);
		return BSL_UNKNOWN;
	}

	memset(bsl_data.buf, 0xFF, sizeof(bsl_data.buf));
	bsl_data.buf[0] = (uint8_t)s;
	bsl_data.buf[1] = header;
	memcpy(bsl_data.buf + 2, rtemp, len);

	//DBG_PRINTF("recv %d bytes cmd %02x; ",
	//           bsl_data.res.len,
	//           bsl_data.res.core_res.cmd);

	if (bsl_data.res.core_res.cmd == BSL_CORE_MSG && bsl_data.res.len == 2U)
	{
		const char *cm = getCore_Message((Core_Message)bsl_data.res.core_res.data[0]);

		if (cm != NULL)
		{
			DBG_PRINTF("%s\r\n", cm);
		}
		else
		{
			DBG_PRINTF("%02x\r\n", bsl_data.res.core_res.data[0]);
		}
	}
	else
	{
		for (int i = 0; i < (int)bsl_data.res.len - 1; i++)
		{
			DBG_PRINTF("%02x ", bsl_data.res.core_res.data[i]);
		}

		DBG_PRINTF("\r\n");
	}

	return BSL_ACK;
}

static void entry_sequence(void)
{
	DBG_PRINTF("BSL entry sequence\r\n");

	ti_ctrl_pins_output_mode();

	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_RESET);

	DWT_Delay_ms(BSL_ENTRY_PRE_LOW_MS);

	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_SET);
	DWT_Delay_us(BSL_ENTRY_FIRST_HIGH_US);

	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_RESET);
	DWT_Delay_us(BSL_ENTRY_GAP_US);

	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_SET);
	DWT_Delay_us(BSL_ENTRY_GAP_US);

	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_SET);
	DWT_Delay_us(BSL_ENTRY_GAP_US);

	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_RESET);
	DWT_Delay_ms(BSL_ENTRY_POST_MS);
}

/* Toggle RESET to put TI in a known state (BOR).
 * Waits BSL_POST_RESET_MS for oscillator + BSL ROM to initialize. */
static void ti_reset_pulse(void)
{
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_RESET);
	DWT_Delay_ms(TI_SOFT_RESET_LOW_MS);
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_SET);
	DWT_Delay_ms(BSL_POST_RESET_MS);
}

static void mass_erase(void)
{
	/* Reset first — ensure TI is not stuck in firmware or bad state */
	ti_reset_pulse();

	entry_sequence();
	uart_reset_baud(USART3, BSL_DEFAULT_BAUD, true, false);

	bsl_clear_state();
	build_cmd_noaddr(BSL_MASS_ERASE, 0, NULL);
	send_cmd();

	DWT_Delay_ms(BSL_MASS_ERASE_WAIT_MS);

	bsl_clear_state();

	/* FR6047 BSL goes unresponsive after mass erase — BOR to revive */
	ti_reset_pulse();
}

static int unlock_default_password(void)
{
	static const uint8_t default_passwd[32] =
	{
		0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
		0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
		0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
		0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF
	};

	for (uint32_t attempt = 0; attempt < BSL_UNLOCK_RETRIES; attempt++)
	{
		/* Fresh BSL entry on every unlock retry */
		entry_sequence();
		uart_reset_baud(USART3, BSL_DEFAULT_BAUD, true, false);
		DWT_Delay_ms(BSL_ENTRY_SETTLE_MS);
		bsl_clear_state();

		build_cmd_noaddr(BSL_RX_PASSWD, sizeof(default_passwd), default_passwd);
		send_cmd();

		if (recv2(BSL_PASSWD_RSP_LEN) != BSL_ACK)
		{
			DBG_PRINTF("failed to unlock BSL (attempt %lu)\r\n", attempt + 1U);
			bg95_public.tifota_bsl_unlock_err++;
			continue;
		}

		DWT_Delay_ms(BSL_POST_UNLOCK_DELAY_MS);

		if (bsl_data.res.core_res.cmd == BSL_CORE_MSG &&
		    bsl_data.res.core_res.data[0] == COREMSG_SUCCESS)
		{
			DBG_PRINTF("BSL unlocked\r\n");
			return 0;
		}

		DBG_PRINTF("unlock rejected (attempt %lu)\r\n", attempt + 1U);
		bg95_public.tifota_bsl_unlock_err++;
	}

	bg95_public.tifota_bsl_passwd_err++;
	return -1;
}

static int change_baud_after_unlock(void)
{
	uint8_t baud_select = BSL_BAUD_SELECT_57600;

	for (uint32_t attempt = 0; attempt < 3U; attempt++)
	{
		bsl_clear_state();
		build_cmd_noaddr(BSL_CHANGE_BAUD_RATE, sizeof(baud_select), &baud_select);
		send_cmd();

		if (recv_ack() == BSL_ACK)
		{
			uart_reset_baud(USART3, BSL_FAST_BAUD, true, false);
			DWT_Delay_ms(BSL_POST_BAUD_SWITCH_DELAY_MS);
			return 0;
		}

		DBG_PRINTF("baud change failed (attempt %lu)\r\n", attempt + 1U);
		bg95_public.tifota_bsl_baud_err++;
		DWT_Delay_ms(20);
	}

	return -1;
}

static int read_version(void)
{
	bsl_clear_state();
	build_cmd_noaddr(BSL_TX_VERSION, 0, NULL);
	send_cmd();

	if (recv2(BSL_VERSION_RSP_LEN) != BSL_ACK)
	{
		DBG_PRINTF("Failed to get version\r\n");
		bg95_public.tifota_version_err++;
		return -1;
	}

	DWT_Delay_ms(BSL_POST_VERSION_DELAY_MS);

	if (bsl_data.res.core_res.cmd == BSL_TX_DATA_BLOCK_R && bsl_data.res.ack == BSL_ACK)
	{
#ifdef DUNE_DEBUG
		uint8_t *v = bsl_data.res.core_res.data;
		DBG_PRINTF("BSL version %02X.%02X.%02X.%02X, bootloader unlocked\r\n",
		           v[0], v[1], v[2], v[3]);
#endif
		return 0;
	}

	//DBG_PRINTF("unexpected cmd byte %02X\r\n", bsl_data.res.core_res.cmd);
	bg95_public.tifota_version_err++;
	return -1;
}

/* Caller must arm gFotaReset/gGotTrigger/lastInfoTime BEFORE reset release */
static bool wait_for_ti_info_after_reset_armed(bool fota, uint32_t timeout_ms)
{
	uint32_t start = HAL_GetTick();

	while ((HAL_GetTick() - start) < timeout_ms && lastInfoTime == 0U)
	{
		ti_hci_loop();
		LL_IWDG_ReloadCounter(IWDG);
	}

	if (fota && gGotTrigger == false)
	{
		bg95_public.tifota_trigger_err++;
	}

	gFotaReset = false;

	if (gGotTrigger)
	{
		DBG_PRINTF("bsl_reset: trigger after %lu ms\r\n", gTriggerTick - gResetReleaseTick);
	}
	else
	{
		DBG_PRINTF("bsl_reset: no trigger\r\n");
	}

	if (lastInfoTime)
	{
		DBG_PRINTF("bsl_reset: got info in %lu ticks\r\n", HAL_GetTick() - start);
		return true;
	}

	DBG_PRINTF("bsl_reset: no info packet\r\n");
	bg95_public.tifota_bsl_reset_err++;
	return false;
}

static bool bsl_reset_soft(bool fota)
{
	DBG_PRINTF("bsl_reset: soft reset path\r\n");

	ti_ctrl_pins_output_mode();

	/* Keep TI powered and TEST low */
	HAL_GPIO_WritePin(EN_VS1_GPIO_Port, EN_VS1_Pin, GPIO_PIN_SET);
	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_RESET);

	/* Arm software-side observability BEFORE reset release */
	lastInfoTime = 0;
	gGotTrigger = false;
	gTriggerTick = 0;

	if (fota)
	{
		gFotaReset = true;
	}

	/* Assert reset */
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_RESET);
	DWT_Delay_ms(TI_SOFT_RESET_LOW_MS);

	/* Release reset */
	gResetReleaseTick = HAL_GetTick();
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_SET);

	return wait_for_ti_info_after_reset_armed(fota, TI_SOFT_BOOT_WAIT_MS);
}

static bool bsl_reset_hard(bool fota)
{
	DBG_PRINTF("bsl_reset: HARD reset (VS1 power cycle)\r\n");
	bg95_public.tifota_hard_reset_cnt++;

	ti_ctrl_pins_output_mode();

	/* Float SPI pins to prevent back-powering TI through ESD diodes */
	spi_bus_pins_safe_for_power_off();

	/* Power off TI — drive TEST/RESET low during power-off */
	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(EN_VS1_GPIO_Port, EN_VS1_Pin, GPIO_PIN_RESET);

	DWT_Delay_ms(TI_HARD_RESET_OFF_MS);

	/* Arm observability before power-on */
	lastInfoTime = 0;
	gGotTrigger = false;
	gTriggerTick = 0;

	if (fota)
	{
		gFotaReset = true;
	}

	/* Power on TI — VS1 high, hold RESET/TEST low while rail stabilizes */
	HAL_GPIO_WritePin(EN_VS1_GPIO_Port, EN_VS1_Pin, GPIO_PIN_SET);
	DWT_Delay_ms(TI_HARD_RESET_OFF_MS); /* wait for VS1 rail to stabilize */

	/* Restore SPI before releasing RESET — TI needs bus ready at boot */
	spi_bus_pins_restore();

	/* Release RESET — TI begins boot */
	gResetReleaseTick = HAL_GetTick();
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_SET);

	return wait_for_ti_info_after_reset_armed(fota, TI_HARD_RESET_BOOT_WAIT_MS);
}

static void ti_fota_init(void)
{
	uart_enable(USART3);
	ti_ctrl_pins_normal_run_state();
	DWT_Delay_ms(5);
}

static void ti_fota_deinit(void)
{
	uart_disable(USART3);
	ti_ctrl_pins_normal_run_state();
}

/* ----------------------------- Public API -------------------------------- */

void test_bsl_ck(void)
{
	uint8_t test[] = { 0x80, 0x06, 0x00, 0x16, 0x00, 0x44, 0x00, 0x00, 0x04, 0x9c, 0x7d };
	uint8_t data[] = { 0x00, 0x04 };
	build_cmd(BSL_CRC_CHECK, sizeof(data), 0x4400, data);

	if (memcmp(test, (void *)&bsl_data, sizeof(test)) != 0)
	{
		DBG_PRINTF("test_bsl_ck fail\r\n");
	}
}

int bsl_init(void)
{
	/* Reset TI to known state before BSL entry */
	ti_reset_pulse();

	/* Initial session setup */
	entry_sequence();
	uart_reset_baud(USART3, BSL_DEFAULT_BAUD, true, false);
	bsl_clear_state();
	bsl_fast_baud = false;

	if (unlock_default_password() != 0)
	{
		return BSL_INIT_UNLOCK_FAIL;
	}

	if (change_baud_after_unlock() != 0)
	{
		/* Baud change failed — fall back to 9600. Slower but avoids bricking. */
		DBG_PRINTF("WARNING: baud change failed, continuing at 9600\r\n");
	}
	else
	{
		bsl_fast_baud = true;
	}

	if (read_version() != 0)
	{
		return BSL_INIT_VERSION_FAIL;
	}

	return BSL_INIT_OK;
}

bool bsl_reset(bool fota)
{
#if TI_USE_SOFT_RESET

	/* Try soft reset first; if it fails, escalate to hard reset immediately */
	if (bsl_reset_soft(fota))
	{
		return true;
	}

	DBG_PRINTF("bsl_reset: soft failed, escalating to hard reset\r\n");
	return bsl_reset_hard(fota);
#else
	(void)fota;
	return false;
#endif
}

bool bsl_reset_soft_only(void)
{
#if TI_USE_SOFT_RESET
	/* Soft reset only — no hard reset escalation. Used at boot so a
	 * dead/bricked TI doesn't delay radio by 20+ seconds. If soft
	 * fails, radio runs first and TI FOTA can fix it. */
	return bsl_reset_soft(false);
#else
	return false;
#endif
}

int bsl_write(uint32_t dst, void *src, size_t size)
{
	if (size > 256U)
	{
		DBG_PRINTF("ERROR %s: called with size too big\r\n", __func__);
		return -1;
	}

#ifdef DUNE_DEBUG

	for (size_t i = 0; i < size; i++)
	{
		uint8_t byte = ((uint8_t *)src)[i];

		if (dst + i == 0xFFE0)
		{
			DBG_PRINTF("Password: ");
		}

		if (dst + i == 0x0FF84)
		{
			DBG_PRINTF("BSL Signature 1 lo: %02X\r\n", byte);
		}

		if (dst + i == 0x0FF85)
		{
			DBG_PRINTF("BSL Signature 1 hi: %02X\r\n", byte);
		}

		if (dst + i == 0x0FF86)
		{
			DBG_PRINTF("BSL Signature 2 lo: %02X\r\n", byte);
		}

		if (dst + i == 0x0FF87)
		{
			DBG_PRINTF("BSL Signature 2 hi: %02X\r\n", byte);
		}

		if (dst + i >= 0xFFE0 && dst + i <= 0xFFFF)
		{
			DBG_PRINTF("0x%02X%s", byte, dst + i == 0xFFFF ? "\n" : ", ");
		}
	}

#endif

	DWT_Delay_us(BSL_WRITE_GUARD_US);
	BSL_Cmd_Byte write_cmd = bsl_fast_baud ? BSL_RX_DATAFAST : BSL_RX_DATA_BLOCK;
	build_cmd(write_cmd, (uint16_t)size, dst, src);
	send_cmd();
	return (recv_ack() == BSL_ACK) ? 0 : -1;
}

int bsl_crc(uint32_t addr, uint16_t size)
{
	DWT_Delay_us(BSL_CRC_GUARD_US);
	build_cmd(BSL_CRC_CHECK, 2, addr, &size);
	send_cmd();

	if (recv2(BSL_CRC_RSP_LEN) != BSL_ACK)
	{
		DBG_PRINTF("crc read failed\r\n");
		return -1;
	}

	if (bsl_data.res.core_res.cmd == BSL_TX_DATA_BLOCK_R)
	{
		uint16_t crc;
		memcpy(&crc, bsl_data.res.core_res.data, 2);
		DBG_PRINTF("got crc %04X\r\n", crc);
		return (int)crc;
	}

	//DBG_PRINTF("unexpected cmd byte %02X\r\n", bsl_data.res.core_res.cmd);
	DWT_Delay_ms(BSL_CRC_ERROR_WAIT_MS);
	return -1;
}

#ifndef DEBUG_TI
static int write_split(uint32_t dst, void *src, size_t size)
{
	uint8_t *p = (uint8_t *)src;

	while (size)
	{
		size_t bs = (size < 256U) ? size : 256U;
		int rs = -1;
		uint8_t trycnt = 0;

		while ((rs = bsl_write(dst, p, bs)) != 0)
		{
			trycnt++;

			if (trycnt >= BSL_WRITE_RETRIES)
			{
				break;
			}
		}

		if (rs != 0)
		{
			return rs;
		}

		size -= bs;
		dst += (uint32_t)bs;
		p += bs;
	}

	return 0;
}
#endif

int ti_fw_crc_cmp(uint8_t *data, size_t size)
{
	uint32_t crc;
	memcpy(&crc, data, sizeof(crc));
	return crc32(data + sizeof(crc), size - sizeof(crc)) != crc;
}

void ti_fota(uint8_t *data, size_t size)
{
#ifndef DEBUG_TI
	size_t index = 0;
	bool hasError = false;
	ti_fota_state = TI_FOTA_FAILURE;

	if (ti_fw_crc_cmp(data, size) != 0)
	{
		DBG_PRINTF("ti_fota: crc mismatch\r\n");
		return;
	}

	ti_fota_init();

	mass_erase();

	int init_stat = BSL_INIT_UNLOCK_FAIL;

	/* Phase 1: soft BSL entry retries */
	for (uint32_t attempt = 0; attempt < 3U; attempt++)
	{
		init_stat = bsl_init();

		if (init_stat == BSL_INIT_OK)
		{
			break;
		}

		DBG_PRINTF("bsl_init retry %lu\r\n", attempt + 1U);
		DWT_Delay_ms(20);
		bsl_clear_state();
	}

	/* Phase 2: VS1 hard reset + retry if soft entry failed */
	if (init_stat != BSL_INIT_OK)
	{
		DBG_PRINTF("bsl_init: soft entry exhausted, trying VS1 hard reset\r\n");
		bg95_public.tifota_hard_reset_cnt++;

		/* Float SPI pins to prevent back-powering TI through ESD diodes */
		spi_bus_pins_safe_for_power_off();

		/* Power cycle TI — hold RESET/TEST low through entire power cycle */
		HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_RESET);
		HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_RESET);
		HAL_GPIO_WritePin(EN_VS1_GPIO_Port, EN_VS1_Pin, GPIO_PIN_RESET);
		DWT_Delay_ms(TI_HARD_RESET_OFF_MS);           /* VS1 off hold */
		HAL_GPIO_WritePin(EN_VS1_GPIO_Port, EN_VS1_Pin, GPIO_PIN_SET);
		DWT_Delay_ms(TI_HARD_RESET_OFF_MS);           /* VS1 rail stabilize, RESET still low */

		/* Restore SPI before releasing RESET */
		spi_bus_pins_restore();

		HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_SET);
		DWT_Delay_ms(BSL_ENTRY_SETTLE_MS);             /* settle after RESET release */

		mass_erase();

		for (uint32_t attempt = 0; attempt < 3U; attempt++)
		{
			init_stat = bsl_init();

			if (init_stat == BSL_INIT_OK)
			{
				break;
			}

			DBG_PRINTF("bsl_init hard retry %lu\r\n", attempt + 1U);
			DWT_Delay_ms(20);
			bsl_clear_state();
		}
	}

	if (init_stat != BSL_INIT_OK)
	{
		DBG_PRINTF("bsl_init error %d (all retries exhausted)\r\n", init_stat);
		bg95_public.tifota_bsl_init_err++;
		ti_fota_deinit();
		return;
	}

	index = sizeof(uint32_t);

	while (index < size)
	{
		Chunk c;
		memcpy(&c, data + index, sizeof(c));

		if (write_split(c.addr, data + index + sizeof(c), c.len) != 0)
		{
			DBG_PRINTF("bsl write failed\r\n");
			hasError = true;
			break;
		}

		DBG_PRINTF("\r\n");

		int ti_crc = bsl_crc(c.addr, c.len);
		uint16_t internal_crc = crc_ccitt_ffff(data + index + sizeof(c), c.len);

		if (ti_crc < 0 || (uint16_t)ti_crc != internal_crc)
		{
			DBG_PRINTF("bsl crc failed: bsl:0x%04X actual:0x%04X\r\n", ti_crc, internal_crc);
			hasError = true;
			bg95_public.tifota_crc_err++;
			break;
		}

		DBG_PRINTF("crc matched 0x%04X\r\n", ti_crc);
		index += c.len + sizeof(c);
	}

	if (index != size)
	{
		DBG_PRINTF("ti_fota: image parse mismatch\r\n");
		hasError = true;
	}

	if (!hasError)
	{
		DBG_PRINTF("ti_fota ver %d success\r\n", dynamicConfig.allowTiFotaVer);
	}
	else
	{
		DBG_PRINTF("ti_fota ver %d FAILURE\r\n", dynamicConfig.allowTiFotaVer);
		bg95_public.tifota_bsl_err++;
	}

	ti_fota_deinit();

	if (!hasError)
	{
		ti_fota_state = TI_FOTA_WRITTEN;
	}

#else
	ti_fota_state = TI_FOTA_WRITTEN;
#endif
}
