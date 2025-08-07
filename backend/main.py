from fastapi import FastAPI
from pydantic import BaseModel

class Metrics(BaseModel):
    email: str
    github_username: str
    lines_suggested: int
    lines_edited: int


app = FastAPI()



@app.post("/createMetric")
def create_metrics(metric: Metrics):
    print(metric)