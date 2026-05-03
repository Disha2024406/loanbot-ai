# ml_model.py — ML training, loading, and prediction logic
import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib, os

MODEL_PATH  = "loan_model.joblib"
SCALER_PATH = "scaler.joblib"
LE_PATH     = "label_encoders.joblib"

model, scaler, label_encoders = None, None, {}

CAT_COLS = ["person_gender", "person_education",
            "person_home_ownership", "loan_intent",
            "previous_loan_defaults_on_file"]
NUM_COLS = ["person_age", "person_income", "person_emp_exp",
            "loan_amnt", "loan_int_rate", "loan_percent_income",
            "cb_person_cred_hist_length", "credit_score"]


def train_model(csv_path="loan_data.csv"):
    global model, scaler, label_encoders
    print("📊 Loading dataset…")
    df = pd.read_csv(csv_path)
    df = df.dropna()

    label_encoders = {}
    for col in CAT_COLS:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col].astype(str))
        label_encoders[col] = le

    X = df[NUM_COLS + CAT_COLS]
    y = df["loan_status"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    print("🤖 Training Gradient Boosting model…")
    model = GradientBoostingClassifier(
        n_estimators=200, learning_rate=0.08,
        max_depth=5, subsample=0.8,
        random_state=42, verbose=0)
    model.fit(X_train_s, y_train)

    y_pred = model.predict(X_test_s)
    acc = accuracy_score(y_test, y_pred)
    print(f"✅ Model accuracy: {acc:.4f}")
    print(classification_report(y_test, y_pred,
          target_names=["Approved", "Rejected"]))

    joblib.dump(model,          MODEL_PATH)
    joblib.dump(scaler,         SCALER_PATH)
    joblib.dump(label_encoders, LE_PATH)
    return acc


def load_or_train(csv_path="loan_data.csv"):
    global model, scaler, label_encoders
    if (os.path.exists(MODEL_PATH) and
            os.path.exists(SCALER_PATH) and
            os.path.exists(LE_PATH)):
        print("📦 Loading cached model…")
        model          = joblib.load(MODEL_PATH)
        scaler         = joblib.load(SCALER_PATH)
        label_encoders = joblib.load(LE_PATH)
    else:
        train_model(csv_path)


def predict_loan(data: dict):
    """Run model inference and return probability + label."""
    row = {}
    for col in NUM_COLS:
        row[col] = float(data.get(col, 0))
    for col in CAT_COLS:
        val = str(data.get(col, ""))
        le  = label_encoders.get(col)
        if le and val in le.classes_:
            row[col] = le.transform([val])[0]
        else:
            row[col] = 0

    X    = pd.DataFrame([row])[NUM_COLS + CAT_COLS]
    Xs   = scaler.transform(X)
    prob = model.predict_proba(Xs)[0]
    label = int(model.predict(Xs)[0])
    return {
        "label":         "APPROVED" if label == 0 else "REJECTED",
        "approved":      bool(label == 0),
        "prob_approved": round(float(prob[0]) * 100, 1),
        "prob_rejected": round(float(prob[1]) * 100, 1),
    }