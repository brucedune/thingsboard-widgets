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
// Labs Incorporated.  The intellectual and technical concepts contained
// herein are proprietary to Dune Labs Incorporated and may be covered by
// U.S. and Foreign Patents, patents in process, and are protected by trade
// secret or copyright law.  Dissemination of this information or reproduction
// of this material is strictly forbidden unless prior written permission is
// obtained from Dune Labs Incorporated.
///////////////////////////////////////////////////////////////////////////////

// MSP430FR6047 firmware flashing driver

/** @file ti_bsl.c
 */
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

#define BSL_HEADER 0x80

TI_FOTA_State ti_fota_state;

typedef enum
{
	BSL_RX_PASSWD = 0x11,
	BSL_MASS_ERASE = 0x15,
	BSL_CRC_CHECK = 0x16,
	BSL_TX_VERSION = 0x19,
	BSL_RX_DATAFAST = 0x1B,
	BSL_CORE_MSG = 0x3B,
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

/** For BSL Core Response */
typedef enum
{
	COREMSG_SUCCESS = 0,
	COREMSG_WRITE_CHECK_FAIL = 1,
	COREMSG_LOCKED = 4,
	COREMSG_PASSWD_ERR = 5,
	COREMSG_UNKNOWN_CMD = 7
} Core_Message;

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
} bsl_data;

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

static void build_cmd_noaddr(uint8_t cmd, uint16_t len, void *data)
{
	bsl_data.cmd.header = BSL_HEADER;
	bsl_data.cmd.len = len + sizeof(bsl_data.cmd.core_cmd.core_cmd_no_addr);
	bsl_data.cmd.core_cmd.core_cmd_no_addr.cmd = cmd;

	memcpy(bsl_data.cmd.core_cmd.core_cmd_no_addr.data, data, len);

	CK_Combined ck;
	ck.ck = crc_ccitt_ffff(
	            (const unsigned char *) &bsl_data.cmd.core_cmd.core_cmd_no_addr,
	            len + sizeof(bsl_data.cmd.core_cmd.core_cmd_no_addr));
	bsl_data.cmd.core_cmd.core_cmd_no_addr.data[len] = ck.ckl;
	bsl_data.cmd.core_cmd.core_cmd_no_addr.data[len + 1] = ck.ckh;
	DBG_PRINTF("built cmd(0x%02X) core length %d\r\n", cmd, bsl_data.cmd.len);
}

static void build_cmd(uint8_t cmd, uint16_t len, uint32_t addr, void *data)
{
	BSL_Addr_Union addr_u;
	addr_u.uint = addr;

	bsl_data.cmd.header = BSL_HEADER;
	bsl_data.cmd.len = len + sizeof bsl_data.cmd.core_cmd.core_cmd;
	bsl_data.cmd.core_cmd.core_cmd.cmd = cmd;

	memcpy(&bsl_data.cmd.core_cmd.core_cmd.addr, &addr_u.split, sizeof(addr_u.split));
	memcpy(bsl_data.cmd.core_cmd.core_cmd.data, data, len);

	CK_Combined ck;
	ck.ck = crc_ccitt_ffff(
	            (const unsigned char *) &bsl_data.cmd.core_cmd.core_cmd,
	            len + sizeof(bsl_data.cmd.core_cmd.core_cmd));
	bsl_data.cmd.core_cmd.core_cmd.data[len] = ck.ckl;
	bsl_data.cmd.core_cmd.core_cmd.data[len + 1] = ck.ckh;
	DBG_PRINTF("built cmd(0x%02X) core length %d\r\n", cmd, bsl_data.cmd.len);
}

// RX data block: https://www.ti.com/lit/ug/slau550ab/slau550ab.pdf page 17
// CKL/CKH at the end of each packet seems to be crc ccitt 0xFFFF
void test_bsl_ck(void)
{
	uint8_t test[] =
	{ 0x80, 0x06, 0x00, 0x16, 0x00, 0x44, 0x00, 0x00, 0x04, 0x9c, 0x7d };
	uint8_t data[] =
	{ 0x00, 0x04 };
	build_cmd(BSL_CRC_CHECK, sizeof data, 0x4400, data);
	int res = memcmp(test, (void *) &bsl_data, sizeof test);

	if (res != 0)
	{
		DBG_PRINTF("test_bsl_ck fail\r\n");
	}
}

/**
 * Get a response, not expecting a header
 */
static ACK_Status recv_ack(void)
{
	_Static_assert(sizeof(ACK_Status) == 1, "wrong size enum");
	_Static_assert(sizeof(BSL_Cmd_Byte) == 1, "wrong size enum");
	ACK_Status stat;
	int s = uart_read_timeout(USART3, &stat, 1, 50);

	if (s != 1)
	{
		DBG_PRINTF("ti_bsl: recv_ack timeout\r\n");
		stat = BSL_UNKNOWN;
	}

	const char *statstr = getACK_Status(stat);
	DBG_PRINTF("got ACK ");

	if (statstr)
	{
		DBG_PRINTF("%s\r\n", statstr);
	}
	else
	{
		DBG_PRINTF("%02x\r\n", stat);
	}

	return stat;
}

uint8_t rtemp[261];

// Does not scan for the first '0x00 0x80' like above recv()
static ACK_Status recv2(uint16_t len)
{
	ACK_Status s;

	if ((s = recv_ack())) // return on non-zero (i.e. on NACK)
	{
		return s;
	}

	len--; // subtract ACK byte
	int nbread = uart_read_timeout(USART3, rtemp, len, 500);

	if (nbread != len)
	{
		DBG_PRINTF("uart recv timeout got %d/%d bytes ", nbread, len);
		return 1;
	}

	memset(bsl_data.buf, 0xFF, sizeof(bsl_data.buf));

	if (rtemp[0] == 0x80)
	{
		memcpy(bsl_data.buf + 1, rtemp, nbread);
		bsl_data.buf[0] = s;

		DBG_PRINTF("recv %d bytes cmd %02x; ", bsl_data.res.len,
		           bsl_data.res.core_res.cmd);

		if (bsl_data.res.core_res.cmd == BSL_CORE_MSG
		    && bsl_data.res.len == 2)
		{
			const char *cm = getCore_Message(bsl_data.res.core_res.data[0]);

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
			for (int i = 0; i < bsl_data.res.len - 1; i++)
			{
				DBG_PRINTF("%02x ", bsl_data.res.core_res.data[i]);
			}

			DBG_PRINTF("\r\n");
		}
	}
	else
	{
		DBG_PRINTF("recv failed\r\n");
	}

	return s;
}



static void send_cmd(void)
{
	uint16_t len = bsl_data.cmd.len + sizeof(BSL_Cmd) - sizeof(BSL_Core_Cmd) + sizeof(CK_Combined);
	DWT_Delay_us(1200);
	int stat = uart_write(USART3, bsl_data.buf, len);

	if (stat != len)
	{
		DBG_PRINTF("send_cmd %d/%d\r\n", stat, len);
	}
}

static void entry_sequence(void)
{
	DBG_PRINTF("BSL entry sequence\r\n");

	// acquire BSL. t_{SBW,En} is 110 microseconds
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_RESET);
	DWT_Delay_us(250);
	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_SET);
	DWT_Delay_us(100);
	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_RESET);
	DWT_Delay_us(100);

	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_SET);
	DWT_Delay_us(100);
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_SET);
	DWT_Delay_us(100);
	HAL_GPIO_WritePin(JTAG_TEST_GPIO_Port, JTAG_TEST_Pin, GPIO_PIN_RESET);

	DWT_Delay_ms(100);
}

static void mass_erase(void)
{
	entry_sequence();
	uart_reset_baud(USART3, 9600, true, false);
	build_cmd_noaddr(BSL_MASS_ERASE, 0, NULL);
	send_cmd();
	DWT_Delay_ms(200);
}

int bsl_init(void)
{
	uint8_t default_passwd[32];
	memset(default_passwd, 0xFF, sizeof(default_passwd));

	LL_GPIO_SetPinMode(GPIOB, JTAG_TEST_Pin, LL_GPIO_MODE_OUTPUT);
	LL_GPIO_SetPinMode(GPIOB, JTAG_RESET_Pin, LL_GPIO_MODE_OUTPUT);

	mass_erase();

	entry_sequence();
	uart_reset_baud(USART3, 9600, true, false);
	uint8_t baud_select = 5;
	build_cmd_noaddr(BSL_CHANGE_BAUD_RATE, sizeof baud_select, &baud_select);
	send_cmd();

	if (recv_ack() != BSL_ACK)
	{
		DBG_PRINTF("Failed to change baud rate\r\n");
		bg95_public.tifota_bsl_baud_err++;
		return 1;
	}

	uart_reset_baud(USART3, 57600, true, false);
	DWT_Delay_ms(5);


	build_cmd_noaddr(BSL_RX_PASSWD, sizeof(default_passwd), default_passwd);
	send_cmd();

	if (recv2(8) != BSL_ACK)
	{
		DBG_PRINTF("failed to unlock BSL\r\n");
		bg95_public.tifota_bsl_passwd_err++;
		return 1;
	}

	DWT_Delay_ms(5);

	if (bsl_data.res.core_res.cmd == BSL_CORE_MSG && bsl_data.res.core_res.data[0] == COREMSG_SUCCESS)
	{
		DBG_PRINTF("BSL unlocked\r\n");
	}
	else
	{
		return 1;
	}

	if (bsl_data.res.core_res.cmd != BSL_CORE_MSG || bsl_data.res.core_res.data[0] != COREMSG_SUCCESS)
	{
		DBG_PRINTF("BSL unlock failed\r\n");
		return 1;
	}

	build_cmd_noaddr(BSL_TX_VERSION, 0, NULL);
	send_cmd();

	if (recv2(11) != BSL_ACK)
	{
		DBG_PRINTF("Failed to get version\r\n");
		return 1;
	}

	DWT_Delay_ms(5);

	if (bsl_data.res.core_res.cmd == 0x3A && bsl_data.res.ack == BSL_ACK)
	{
#ifdef DUNE_DEBUG
		uint8_t *v = bsl_data.res.core_res.data;
		DBG_PRINTF("BSL version %02X.%02X.%02X.%02X, bootloader unlocked\r\n", v[0], v[1], v[2], v[3]);
#endif
		return 0;
	}
	else
	{
		DBG_PRINTF("unexpected cmd byte %02X\r\n", bsl_data.res.core_res.cmd);
		return 1;
	}
}

bool bsl_reset(void)
{
//todo
	LL_GPIO_SetPinMode(GPIOB, JTAG_RESET_Pin, LL_GPIO_MODE_OUTPUT);

	HAL_Delay(500);
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_SET);
	DWT_Delay_ms(50);
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_RESET);
	DWT_Delay_ms(50);
	HAL_GPIO_WritePin(JTAG_RESET_GPIO_Port, JTAG_RESET_Pin, GPIO_PIN_SET);
	uart_reset_baud(USART3, 115200, false, false);
	//HAL_Delay(2000);

	lastInfoTime = 0;
	uint32_t start = HAL_GetTick();

	while (HAL_GetTick() - start < 3000 && lastInfoTime == 0)
	{
		ti_hci_loop();
	}

	if (lastInfoTime)
	{
		DBG_PRINTF("bsl_reset: got info in %ul ticks\r\n", HAL_GetTick() - start);
	}
	else
	{
		DBG_PRINTF("bsl_reset: no info packet\r\n");
	}

	//ti_update_and_start();

	LL_GPIO_SetPinMode(GPIOB, JTAG_RESET_Pin, LL_GPIO_MODE_ANALOG);
	LL_GPIO_SetPinMode(GPIOB, JTAG_TEST_Pin, LL_GPIO_MODE_ANALOG);

	return lastInfoTime;
}

int bsl_write(uint32_t dst, void *src, size_t size)
{
	if (size > 256)
	{
		DBG_PRINTF("ERROR %s: called with size too big\r\n", __func__);
		return -1;
	}

#ifdef DUNE_DEBUG

	for (size_t i = 0; i < size; i++)
	{
		uint8_t byte = ((uint8_t *) src)[i];

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
	DWT_Delay_us(1250);
	build_cmd(BSL_RX_DATAFAST, size, dst, src);
	send_cmd();
	return recv_ack();
}

uint16_t bsl_crc(uint32_t addr, uint16_t size)
{
	DWT_Delay_us(1250);
	build_cmd(BSL_CRC_CHECK, 2, addr, &size);

	send_cmd();
	recv2(9);

	if (bsl_data.res.core_res.cmd == 0x3A)
	{
		uint16_t crc;
		memcpy(&crc, bsl_data.res.core_res.data, 2);
		DBG_PRINTF("got crc %04X\r\n", crc);
		return crc;
	}
	else
	{
		DBG_PRINTF("unexpected cmd byte %02X\r\n", bsl_data.res.core_res.cmd);
	}

	DWT_Delay_ms(50);
	return 0;
}

#ifndef DEBUG_TI
static int write_split(uint32_t dst, void *src, size_t size)
{
	while (size)
	{
		size_t bs = size < 256 ? size : 256;
		int rs;
		int8_t trycnt = 0;

		while ((rs = bsl_write(dst, src, bs)) != 0)
		{
			trycnt++;

			if (trycnt > 5)
			{
				break;
			}
		}

		if (rs != 0)
		{
			return rs;
		}

		size -= bs;
		dst += bs;
		src += bs;
	}

	return 0;
}

#endif

int ti_fw_crc_cmp(uint8_t *data, size_t size)
{
	uint32_t crc;
	memcpy(&crc, data, sizeof crc);

	return crc32(data + sizeof(crc), size - sizeof(crc)) - crc;
}

void ti_fota(uint8_t *data, size_t size)
{
#ifndef DEBUG_TI
	int index = 0;
	bool hasError = false;
	ti_fota_state = TI_FOTA_FAILURE;

	if (ti_fw_crc_cmp(data, size) != 0)
	{
		DBG_PRINTF("ti_fota: crc mismatch\r\n");
		return;
	}

	uart_enable(USART3);
	int init_stat;

	if ((init_stat = bsl_init()) != 0)
	{
		DBG_PRINTF("bsl_init error %d\r\n", init_stat);
		bg95_public.tifota_bsl_init_err++;
		return;
	}

	DBG_PRINTF("\r\n");
	index += sizeof(uint32_t);

	while (index < size)
	{
		Chunk c;
		memcpy(&c, data + index, sizeof c);

		if (write_split(c.addr, data + index + sizeof c, c.len) != 0)
		{
			DBG_PRINTF("bsl write failed\r\n");
			hasError = true;
			break;
		}

		DBG_PRINTF("\r\n");
		uint16_t ti_crc = bsl_crc(c.addr, c.len);
		uint16_t internal_crc = crc_ccitt_ffff(data + index + sizeof c, c.len);

		if (ti_crc == 0 || internal_crc != ti_crc)
		{
			DBG_PRINTF("bsl crc failed: bsl:0x%04X actual:0x%04x\r\n", ti_crc, internal_crc);
			hasError = true;
			bg95_public.tifota_crc_err++;
			break;
		}
		else
		{
			DBG_PRINTF("crc matched 0x%04X\r\n", ti_crc);
		}

		index += c.len + sizeof c;
	}

	if (index != size)
	{
		DBG_PRINTF("ti_fota: ?\r\n");
		hasError = true;
	}

	if (hasError == false)
	{
		DBG_PRINTF("ti_fota ver %d success\r\n", dynamicConfig.allowTiFotaVer);
	}
	else
	{
		DBG_PRINTF("ti_fota ver %d FAILURE\r\n", dynamicConfig.allowTiFotaVer);
		bg95_public.tifota_bsl_err++;
	}

	uart_disable(USART3);
#endif

	if (hasError == false)
	{
		ti_fota_state = TI_FOTA_WRITTEN;
	}

}
