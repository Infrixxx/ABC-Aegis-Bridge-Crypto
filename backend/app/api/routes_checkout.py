import os
import sqlite3
import random
import requests
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables from backend/.env
load_dotenv()

router = APIRouter()

# Path to the SQLite DB scaffolded earlier
DB_FILE = os.path.join(os.path.dirname(__file__), "../../abc_state.db")

class CheckoutRequest(BaseModel):
    phone_number: str
    amount_zar: float

def get_live_zar_to_usdc_rate():
    # Safely pull the key from your .env file
    api_key = os.getenv("API_NINJAS_KEY")
    
    if not api_key:
        print("Warning: API_NINJAS_KEY not found in .env. Falling back to 0.055.")
        return 0.055

    try:
        response = requests.get(
            'https://api.api-ninjas.com/v1/exchangerate',
            params={'pair': 'ZAR_USD'},
            headers={'X-Api-Key': api_key},
            timeout=5
        )
        response.raise_for_status()
        
        # Extract the live multiplier from API Ninjas
        return response.json()['exchange_rate']
        
    except requests.exceptions.RequestException as e:
        print(f"FX Fetch Failed: {e}. Falling back to cached rate.")
        return 0.055 

@router.post("/")
def create_checkout(request: CheckoutRequest):
    try:
        # Generate XRPL Destination Tag to solve the "Two Ice Creams" matching bug
        destination_tag = random.randint(100000, 99999999)
        order_id = str(destination_tag)
        
        # Fetch live rate, calculate exact crypto quote, and set 60-second lock
        live_rate = get_live_zar_to_usdc_rate()
        quoted_crypto = round(request.amount_zar * live_rate, 2)
        expiry_time = datetime.utcnow() + timedelta(seconds=60)
        
        # Save to the Hybrid Ledger (SQLite)
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Ensure the user exists in the custodial identity layer
        cursor.execute(
            "INSERT OR IGNORE INTO users (phone_number, custodial_wallet) VALUES (?, ?)", 
            (request.phone_number, "rMockCustodialWalletAddress123")
        )
        
        # Lock the order details in the ledger
        cursor.execute('''
            INSERT INTO orders (order_id, phone_number, amount_zar, quoted_crypto, fx_lock_expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (order_id, request.phone_number, request.amount_zar, quoted_crypto, expiry_time.isoformat(), 'PENDING'))
        
        conn.commit()
        conn.close()
        
        # Return the payload for the React POS, QR code, and USSD menus
        return {
            "status": "success",
            "order_id": order_id,
            "destination_tag": destination_tag,
            "amount_zar": request.amount_zar,
            "quoted_crypto": quoted_crypto,
            "expires_at": expiry_time.isoformat(),
            "qr_payload": f"xrpl://pay?to=rTreasuryWalletAddress&amount={quoted_crypto}&dt={destination_tag}",
            "ussd_shortcode": f"*123*{destination_tag}#"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))