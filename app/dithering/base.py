from abc import ABC, abstractmethod
from typing import Dict, Any, List, Type
import numpy as np
from pydantic import BaseModel

class ParamSpec(BaseModel):
    name: str
    type: str  # "select", "range", "number"
    default: Any
    options: List[Any] = []
    min_val: float = 0
    max_val: float = 1
    step: float = 0.1

class DitherAlgorithm(ABC):
    id: str
    name: str
    description: str
    parameters: List[ParamSpec] = []

    @abstractmethod
    def process(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Accepts an RGB NumPy array (H, W, 3) with values 0-255 and returns a dithered RGB array."""
        pass

class DitherRegistry:
    _registry: Dict[str, DitherAlgorithm] = {}

    @classmethod
    def register(cls, algo_cls: Type[DitherAlgorithm]):
        instance = algo_cls()
        cls._registry[instance.id] = instance
        return algo_cls

    @classmethod
    def get(cls, algo_id: str) -> DitherAlgorithm:
        return cls._registry.get(algo_id)

    @classmethod
    def list_all(cls):
        return [
            {
                "id": algo.id,
                "name": algo.name,
                "description": algo.description,
                "parameters": [p.dict() for p in algo.parameters]
            }
            for algo in cls._registry.values()
        ]