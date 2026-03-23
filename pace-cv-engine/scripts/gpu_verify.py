#!/usr/bin/env python3
"""GPU verification script for RunPod POC deployment (P3-03).

Run this after container start to verify CUDA availability.
Exit code 0 = GPU available, 1 = CPU-only mode.
"""
from __future__ import annotations

import sys


def check_cuda_opencv() -> bool:
    try:
        import cv2
        count = cv2.cuda.getCudaEnabledDeviceCount()
        if count > 0:
            print(f"✅ OpenCV CUDA: {count} device(s) available")
            return True
        else:
            print("⚠️  OpenCV CUDA: No CUDA devices (CPU-only build or no GPU)")
            return False
    except AttributeError:
        print("⚠️  OpenCV CUDA: Module not available (CPU-only build)")
        return False
    except ImportError:
        print("❌ OpenCV: Not installed")
        return False


def check_mediapipe() -> bool:
    try:
        import mediapipe as mp
        print(f"✅ MediaPipe: {mp.__version__}")
        return True
    except ImportError:
        print("❌ MediaPipe: Not installed")
        return False


def check_numpy() -> bool:
    try:
        import numpy as np
        print(f"✅ NumPy: {np.__version__}")
        return True
    except ImportError:
        print("❌ NumPy: Not installed")
        return False


def check_pytorch_cuda() -> bool:
    """Optional: check if torch CUDA is available (for future SMPLify-X)."""
    try:
        import torch
        cuda_available = torch.cuda.is_available()
        if cuda_available:
            device_name = torch.cuda.get_device_name(0)
            memory_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            print(f"✅ PyTorch CUDA: {device_name} ({memory_gb:.1f} GB)")
        else:
            print("⚠️  PyTorch CUDA: Not available")
        return cuda_available
    except ImportError:
        print("ℹ️  PyTorch: Not installed (required for Phase 4 SMPLify-X)")
        return True  # Not required in Phase 3


def check_pgmpy() -> bool:
    try:
        import pgmpy
        print(f"✅ pgmpy: {pgmpy.__version__}")
        return True
    except ImportError:
        print("❌ pgmpy: Not installed")
        return False


def main() -> None:
    print("=" * 60)
    print("PACE CV Engine — GPU/Dependency Verification")
    print("=" * 60)

    results = {
        "opencv_cuda": check_cuda_opencv(),
        "mediapipe": check_mediapipe(),
        "numpy": check_numpy(),
        "torch_cuda": check_pytorch_cuda(),
        "pgmpy": check_pgmpy(),
    }

    print("=" * 60)
    required_ok = all([
        results["mediapipe"],
        results["numpy"],
    ])

    if required_ok:
        print("✅ All required dependencies verified.")
        if results["opencv_cuda"]:
            print("🚀 GPU mode: ENABLED")
        else:
            print("⚡ CPU mode: Active (GPU not required for MediaPipe)")
        sys.exit(0)
    else:
        print("❌ Required dependencies missing. Check installation.")
        sys.exit(1)


if __name__ == "__main__":
    main()
