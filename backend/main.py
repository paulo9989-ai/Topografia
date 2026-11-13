from datetime import datetime, timezone
from math import atan2, degrees
from typing import Optional
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(title="SIMAR-PE API", version="0.1.0")
app.mount("/static", StaticFiles(directory="frontend"), name="static")
sos_requests = []

class Location(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

class SOSRequest(Location):
    name: str = Field(default="Pessoa solicitante", max_length=100)
    message: str = Field(default="Preciso de ajuda.", max_length=500)

@app.get("/")
def home():
    return FileResponse("frontend/index.html")

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "SIMAR-PE", "version": "0.1.0"}

@app.get("/api/weather")
async def weather(latitude: float, longitude: float):
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": latitude, "longitude": longitude,
        "hourly": "precipitation,precipitation_probability,temperature_2m,weather_code",
        "forecast_days": 1, "timezone": "America/Recife"
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        items = []
        for i, time in enumerate(times[:12]):
            items.append({
                "time": time,
                "precipitation_mm": (hourly.get("precipitation") or [None]*len(times))[i],
                "precipitation_probability": (hourly.get("precipitation_probability") or [None]*len(times))[i],
                "temperature_c": (hourly.get("temperature_2m") or [None]*len(times))[i],
                "weather_code": (hourly.get("weather_code") or [None]*len(times))[i],
            })
        return {"source": "Open-Meteo", "timezone": data.get("timezone"), "hours": items,
                "updated_at": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Não foi possível consultar a previsão: {str(exc)}")

@app.get("/api/elevation")
async def elevation(latitude: float, longitude: float):
    # Grade 7x7 em torno do ponto central (aprox. 600 m x 600 m).
    # A área maior torna a camada de calor claramente visível no mapa.
    # Cada célula recebe uma altitude consultada na fonte Open-Elevation.
    spacing = 0.0009  # aproximadamente 100 m em latitude
    grid_size = 7
    half = grid_size // 2
    points = []
    for row in range(grid_size):
        for col in range(grid_size):
            lat = latitude + (row - half) * spacing
            lon = longitude + (col - half) * spacing
            points.append({"latitude": lat, "longitude": lon})

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(
                "https://api.open-elevation.com/api/v1/lookup",
                json={"locations": points}
            )
            response.raise_for_status()
            results = response.json().get("results", [])
        if len(results) != len(points):
            raise ValueError("Resposta incompleta da API de elevação")

        elevations = [float(item["elevation"]) for item in results]
        center_index = half * grid_size + half
        center = elevations[center_index]
        # Estima declividade usando a maior diferença entre o centro e os
        # pontos cardeais imediatamente vizinhos (distância aproximada de 50 m).
        neighbor_indexes = [center_index-grid_size, center_index+grid_size,
                            center_index-1, center_index+1]
        max_delta = max(abs(elevations[i] - center) for i in neighbor_indexes)
        slope_pct = (max_delta / 50.0) * 100.0
        grid = []
        for row in range(grid_size):
            for col in range(grid_size):
                index = row * grid_size + col
                point = points[index]
                grid.append({
                    "latitude": point["latitude"],
                    "longitude": point["longitude"],
                    "elevation_m": elevations[index],
                    "row": row,
                    "col": col
                })
        return {
            "source": "Open-Elevation",
            "elevation_m": center,
            "neighbor_elevations_m": [elevations[i] for i in neighbor_indexes],
            "estimated_slope_percent": round(slope_pct, 2),
            "sample_radius_m": 300,
            "grid": grid,
            "grid_size": grid_size,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Topografia indisponível: {str(exc)}")

@app.post("/api/sos")
def create_sos(request: SOSRequest):
    item = {
        "id": len(sos_requests) + 1,
        "name": request.name,
        "message": request.message,
        "latitude": request.latitude,
        "longitude": request.longitude,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "Registrado localmente — não enviado aos órgãos de emergência"
    }
    sos_requests.append(item)
    return {"ok": True, "request": item,
            "warning": "Este MVP não aciona serviços públicos. Em emergência, ligue 193, 192 ou 199."}

@app.get("/api/sos")
def list_sos():
    return {"items": sos_requests}
