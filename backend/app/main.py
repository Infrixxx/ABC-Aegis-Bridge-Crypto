from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import routes_checkout, routes_ussd, routes_machine, routes_voice

app = FastAPI(title="Aegis Bridge Crypto (ABC) API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_checkout.router, prefix="/api/checkout", tags=["Checkout"])
app.include_router(routes_ussd.router, prefix="/api/ussd", tags=["USSD Webhook"])
app.include_router(routes_machine.router, prefix="/api/machine", tags=["HTTP 402 Machine API"])
app.include_router(routes_voice.router, prefix="/api/voice", tags=["IVR Voice API"])

@app.get("/")
def read_root():
    return {"status": "Aegis Bridge Crypto Engine Active"}
