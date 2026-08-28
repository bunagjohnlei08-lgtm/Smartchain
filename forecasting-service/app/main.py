from fastapi import FastAPI

app = FastAPI(
    title="SmartChain AI Demand Forecasting Service",
    version="1.0.0"
)

@app.get("/")
def root():
    return {
        "service": "SmartChain Forecasting Service",
        "status": "running"
    }

@app.get("/health")
def health():
    return {
        "status": "healthy"
    }