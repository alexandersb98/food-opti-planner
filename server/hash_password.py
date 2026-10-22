"""Make the Argon2 hash of the login password, for the PASSWORD_HASH setting.

Usage: python -m server.hash_password
"""

import sys
from getpass import getpass

from argon2 import PasswordHasher


def main() -> int:
    password = getpass("Password: ")
    if not password:
        print("The password is empty.", file=sys.stderr)
        return 1
    if getpass("Password again: ") != password:
        print("The passwords differ.", file=sys.stderr)
        return 1
    print(PasswordHasher().hash(password))
    return 0


if __name__ == "__main__":
    sys.exit(main())
