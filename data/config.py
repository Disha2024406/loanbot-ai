# config.py — Loads environment variables from .env
import os
from dotenv import load_dotenv

load_dotenv()  # Reads your .env file automatically

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SECRET_KEY        = os.environ.get("SECRET_KEY", "mortgage-planner-secret-2024")
LOAN_DATA_CSV     = os.environ.get("LOAN_DATA_CSV", "loan_data.csv")