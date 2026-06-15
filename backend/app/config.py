from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    intervals_api_key: str
    athlete_id: str
    data_dir: Path = Path("data")
    output_dir: Path = Path("output")
    run_segment_seconds: int = 60
    ride_segment_seconds: int = 180
    rider_mass_kg: float = 75.0   # kg — used for power estimation; set in .env to override
    bike_mass_kg: float = 8.0     # kg — bike + kit
    sync_hour: int = 6            # hour (0-23) for the automatic daily sync

    model_config = {"env_file": ".env"}


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
(settings.data_dir / "streams").mkdir(exist_ok=True)
settings.output_dir.mkdir(parents=True, exist_ok=True)
