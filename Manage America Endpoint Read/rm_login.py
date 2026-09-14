"""
Rent Manager Login Automation — Step 1

Opens Chromium with a persistent profile so cookies survive between runs.
First run: user logs in manually; the script saves the session.
Subsequent runs: reuses cookies and reports "already logged in" if still valid.

Usage:
    python rm_login.py --url https://yourcompany.rentmanager.com
    python rm_login.py --url https://yourcompany.rentmanager.com --keep-open
    python rm_login.py --reset

Setup (one time):
    pip install -r requirements.txt
    playwright install chromium
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:
    print("ERROR: Playwright is not installed.")
    print("Run:  pip install -r requirements.txt")
    print("Then: playwright install chromium")
    sys.exit(1)


SCRIPT_DIR = Path(__file__).parent.resolve()
PROFILE_DIR = SCRIPT_DIR / "rm_profile"

# How long (seconds) to wait for the user to finish manual login on first run.
MANUAL_LOGIN_TIMEOUT = 300

# After navigating to the login URL, how long to wait before deciding whether
# we're already authenticated (URL contains "login" == not logged in).
SESSION_CHECK_WAIT = 4


def parse_args():
    p = argparse.ArgumentParser(description="Rent Manager login automation")
    p.add_argument("--url", help="Rent Manager login URL (e.g. https://yourco.rentmanager.com)")
    p.add_argument("--keep-open", action="store_true",
                   help="Leave browser open after confirming login (Ctrl+C to exit)")
    p.add_argument("--reset", action="store_true",
                   help="Delete saved profile and force a fresh login")
    return p.parse_args()


def reset_profile():
    if PROFILE_DIR.exists():
        shutil.rmtree(PROFILE_DIR)
        print(f"Profile deleted: {PROFILE_DIR}")
    else:
        print("No profile to delete.")


def is_logged_in(page):
    """
    Heuristic: after initial navigation + short settle time, if the URL still
    contains 'login' or we see a password field, we're not logged in yet.
    """
    url = page.url.lower()
    if "login" in url or "signin" in url or "sign-in" in url:
        return False
    # If a password field is visible, the login form is still showing.
    try:
        if page.locator('input[type="password"]').first.is_visible(timeout=1000):
            return False
    except PWTimeout:
        pass
    except Exception:
        pass
    return True


def wait_for_manual_login(page):
    """
    Poll until the login form disappears (user has successfully logged in) or
    timeout expires.
    """
    print(f"\n>>> Please log in to Rent Manager in the browser window.")
    print(f">>> Waiting up to {MANUAL_LOGIN_TIMEOUT}s for you to finish...\n")

    import time
    deadline = time.time() + MANUAL_LOGIN_TIMEOUT
    while time.time() < deadline:
        try:
            if is_logged_in(page):
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def main():
    args = parse_args()

    if args.reset:
        reset_profile()
        if not args.url:
            return

    if not args.url:
        print("ERROR: --url is required (e.g. --url https://yourcompany.rentmanager.com)")
        sys.exit(1)

    PROFILE_DIR.mkdir(exist_ok=True)
    first_run = not any(PROFILE_DIR.iterdir())

    print(f"Profile dir: {PROFILE_DIR}")
    print(f"First run:   {first_run}")
    print(f"Target URL:  {args.url}\n")

    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
            viewport={"width": 1280, "height": 800},
        )
        page = context.pages[0] if context.pages else context.new_page()

        try:
            page.goto(args.url, wait_until="domcontentloaded", timeout=30000)
        except PWTimeout:
            print("WARNING: Initial page load timed out — continuing anyway.")

        # Give the app a moment to redirect (RM often bounces between URLs on auth check)
        page.wait_for_timeout(SESSION_CHECK_WAIT * 1000)

        if is_logged_in(page):
            print("✓ Already logged in — session is valid.")
            status_ok = True
        else:
            status_ok = wait_for_manual_login(page)
            if status_ok:
                print("✓ Login successful — session saved.")
            else:
                print("✗ Login timeout — session NOT saved.")

        if args.keep_open and status_ok:
            print("\nBrowser staying open. Press Ctrl+C in this terminal to close.")
            try:
                while True:
                    page.wait_for_timeout(1000)
            except KeyboardInterrupt:
                print("\nClosing browser...")

        context.close()

    sys.exit(0 if status_ok else 1)


if __name__ == "__main__":
    main()
