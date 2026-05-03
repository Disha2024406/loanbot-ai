# app.py — Entry point, starts the Flask server
from flask import Flask
from flask_cors import CORS

from config import SECRET_KEY, LOAN_DATA_CSV
from model import load_or_train
from routes import api

app = Flask(__name__)
app.secret_key = SECRET_KEY
CORS(app, supports_credentials=True)

app.register_blueprint(api, url_prefix="/api")

if __name__ == "__main__":
    print("🚀 Loan Chatbot Backend starting…")
    load_or_train(LOAN_DATA_CSV)
    app.run(host="0.0.0.0", port=5000, debug=True)