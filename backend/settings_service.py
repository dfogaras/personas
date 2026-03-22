"""Settings singleton and related helpers."""

import argparse
import logging
import os

from config import load_settings, Settings


def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None, help="Path to config.json (omit to use env vars)")
    return parser.parse_known_args()[0]


logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

_settings = load_settings(_parse_args().config)
_frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")


def get_settings() -> Settings:
    return _settings


def get_frontend_path(file_name: str = "") -> str:
    return os.path.join(_frontend_path, file_name) if file_name else _frontend_path


def read_frontend_file(filename: str) -> str:
    with open(get_frontend_path(filename)) as f:
        return f.read()
