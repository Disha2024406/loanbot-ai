# routes.py — All Flask API route handlers
import re, json, uuid
from flask import Blueprint, request, jsonify
from datetime import datetime
import anthropic

from config import ANTHROPIC_API_KEY
from model import model, predict_loan, train_model
from prompt import SYSTEM_PROMPT, DATASET_STATS
from flask import send_from_directory

api = Blueprint("api", __name__)

# In-memory session store (use Redis in production)
sessions = {}


def get_ai_client():
    if not ANTHROPIC_API_KEY:
        return None
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

@api.route('/frontend/<path:filename>')
def frontend(filename):
    return send_from_directory('../frontend', filename)

@api.route("/health")
def health():
    return jsonify({"status": "ok", "model_loaded": model is not None})


@api.route("/chat", methods=["POST"])
def chat():
    body      = request.json or {}
    messages  = body.get("messages", [])
    sess_id   = body.get("session_id", str(uuid.uuid4()))
    user_data = body.get("user_data", {})

    sess = sessions.setdefault(sess_id, {"collected": {}, "predictions": []})
    sess["collected"].update(user_data)

    client = get_ai_client()
    if not client:
        return jsonify({"error": "ANTHROPIC_API_KEY not set"}), 500

    resp = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    reply = resp.content[0].text

    # ── Extract [PREDICT:…] block ──────────────────────────────────────
    prediction_result = None
    pm = re.search(r'\[PREDICT:(\{.*?\})\]', reply, re.DOTALL)
    if pm and model is not None:
        try:
            pred_data = json.loads(pm.group(1))
            if pred_data.get("person_income", 0) > 0 and pred_data.get("loan_amnt", 0) > 0:
                pred_data["loan_percent_income"] = round(
                    pred_data["loan_amnt"] / pred_data["person_income"], 4)
            result = predict_loan(pred_data)
            prediction_result = {**pred_data, **result}
            sess["predictions"].append({
                "timestamp": datetime.utcnow().isoformat(),
                **prediction_result
            })
            reply = reply.replace(pm.group(0), "")
        except Exception as e:
            print("Prediction error:", e)

    # ── Extract [EMI:…] block ─────────────────────────────────────────
    emi_result = None
    em = re.search(r'\[EMI:(\{.*?\})\]', reply)
    if em:
        try:
            ed = json.loads(em.group(1))
            P, r_annual, n_years = ed["principal"], ed["rate"], ed["tenure_years"]
            r = r_annual / 100 / 12
            n = n_years * 12
            emi   = P * r * (1+r)**n / ((1+r)**n - 1) if r > 0 else P / n
            total = emi * n
            emi_result = {
                "emi": round(emi, 2),
                "total_paid": round(total, 2),
                "total_interest": round(total - P, 2),
                "principal": P, "rate": r_annual, "tenure_years": n_years
            }
            reply = reply.replace(em.group(0), "")
        except Exception as e:
            print("EMI error:", e)

    sessions[sess_id] = sess
    return jsonify({
        "reply": reply.strip(),
        "session_id": sess_id,
        "prediction": prediction_result,
        "emi": emi_result,
        "session_data": sess,
    })


@api.route("/predict", methods=["POST"])
def predict():
    data = request.json or {}
    if model is None:
        return jsonify({"error": "Model not loaded"}), 500
    try:
        return jsonify(predict_loan(data))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@api.route("/stats")
def stats():
    return jsonify(DATASET_STATS)


@api.route("/session/<sess_id>")
def get_session(sess_id):
    return jsonify(sessions.get(sess_id, {}))


@api.route("/train", methods=["POST"])
def retrain():
    body     = request.json or {}
    csv_path = body.get("csv_path", "loan_data.csv")
    try:
        acc = train_model(csv_path)
        return jsonify({"status": "trained", "accuracy": acc})
    except Exception as e:
        return jsonify({"error": str(e)}), 500