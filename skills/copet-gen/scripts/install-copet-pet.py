#!/usr/bin/env python3
"""Install a hatch-pet package into CoPet's user pet directory."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path


PET_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy a pet package into ~/.copet/pets with collision-safe ids."
    )
    parser.add_argument(
        "--source-pet-dir",
        required=True,
        help="Path to a hatch-pet package directory containing pet.json.",
    )
    parser.add_argument(
        "--copet-config-dir",
        default=os.environ.get("COPET_CONFIG_DIR", str(Path.home() / ".copet")),
        help="CoPet config directory. Defaults to $COPET_CONFIG_DIR or ~/.copet.",
    )
    return parser.parse_args()


def load_pet_json(source_pet_dir: Path) -> dict:
    pet_json_path = source_pet_dir / "pet.json"
    if not pet_json_path.is_file():
        raise ValueError(f"source pet package is missing pet.json: {pet_json_path}")

    try:
        pet_data = json.loads(pet_json_path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid pet.json: {pet_json_path}: {exc}") from exc

    if not isinstance(pet_data, dict):
        raise ValueError(f"pet.json must contain a JSON object: {pet_json_path}")

    return pet_data


def package_id(source_pet_dir: Path, pet_data: dict) -> str:
    pet_id = str(pet_data.get("id") or source_pet_dir.name).strip()
    if not pet_id:
        pet_id = source_pet_dir.name
    if not PET_ID_PATTERN.fullmatch(pet_id):
        raise ValueError(
            f"pet id must be path-safe letters, digits, '.', '_' or '-': {pet_id!r}"
        )
    return pet_id


def next_available_id(pets_dir: Path, base_id: str) -> str:
    if not (pets_dir / base_id).exists():
        return base_id

    suffix = 2
    while True:
        candidate = f"{base_id}-{suffix}"
        if not (pets_dir / candidate).exists():
            return candidate
        suffix += 1


def install_pet(source_pet_dir: Path, copet_config_dir: Path) -> tuple[str, Path, str]:
    source_pet_dir = source_pet_dir.expanduser().resolve()
    if not source_pet_dir.is_dir():
        raise ValueError(f"source pet directory does not exist: {source_pet_dir}")

    pet_data = load_pet_json(source_pet_dir)
    source_id = package_id(source_pet_dir, pet_data)

    pets_dir = copet_config_dir.expanduser() / "pets"
    pets_dir.mkdir(parents=True, exist_ok=True)

    installed_id = next_available_id(pets_dir, source_id)
    installed_dir = pets_dir / installed_id
    shutil.copytree(source_pet_dir, installed_dir)

    pet_data["id"] = installed_id
    (installed_dir / "pet.json").write_text(
        json.dumps(pet_data, ensure_ascii=False, indent=2) + "\n"
    )

    return source_id, installed_dir, installed_id


def main() -> int:
    args = parse_args()
    try:
        source_id, installed_dir, installed_id = install_pet(
            Path(args.source_pet_dir), Path(args.copet_config_dir)
        )
    except Exception as exc:
        print(f"error={exc}", file=sys.stderr)
        return 1

    print(f"source_pet_id={source_id}")
    print(f"installed_pet_id={installed_id}")
    print(f"installed_pet_dir={installed_dir}")
    print(f"collision={'true' if source_id != installed_id else 'false'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
