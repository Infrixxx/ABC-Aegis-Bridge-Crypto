from fastapi import APIRouter, Form, Response
import sqlite3
import os

router = APIRouter()
DB_FILE = os.path.join(os.path.dirname(__file__), "../../abc_state.db")

@router.post("/")
def ussd_callback(
    sessionId: str = Form(default=""),
    serviceCode: str = Form(default=""),
    phoneNumber: str = Form(default=""),
    text: str = Form(default="")
):
    """
    Africa's Talking sends USSD inputs as standard Form Data.
    The 'text' field contains the user's input sequence separated by asterisks (e.g., '1*79477624').
    """
    response_text = ""
    
    # Empty text means the user just dialed the code (e.g., *120*123#)
    if text == "":
        response_text = "CON Welcome to Aegis Crypto Bridge\n1. Pay Merchant\n2. Check Balance"
        
    # User selected "1" to pay
    elif text == "1":
        response_text = "CON Enter Merchant Order ID (Destination Tag):"
        
    # User entered the Order ID (e.g., "1*79477624")
    elif text.startswith("1*"):
        parts = text.split("*")
        
        # Step 1: Look up the order in the database
        if len(parts) == 2:
            order_id = parts[1]
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT amount_zar, quoted_crypto, status FROM orders WHERE order_id = ?", (order_id,))
            row = cursor.fetchone()
            conn.close()

            if row:
                if row[2] == "PAID":
                    response_text = "END This order has already been paid."
                else:
                    response_text = f"CON Pay R{row[0]} ({row[1]} USDC)?\n1. Confirm & Sign Transaction"
            else:
                response_text = "END Order not found or expired. Please ask merchant for a new code."
                
        # Step 2: User confirmed the payment (e.g., "1*79477624*1")
        elif len(parts) == 3 and parts[2] == "1":
            order_id = parts[1]
            
            # Update the database to PAID 
            # (In Phase 3, this triggers the LangGraph Treasury Agent to move the XRPL funds)
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("UPDATE orders SET status = 'PAID' WHERE order_id = ?", (order_id,))
            conn.commit()
            conn.close()
            
            response_text = "END Payment Successful!\nTransaction matched on-chain."
            
    else:
        response_text = "END Invalid Input."

    # Africa's Talking requires plain text responses starting with CON (continue) or END (terminate)
    return Response(content=response_text, media_type="text/plain")