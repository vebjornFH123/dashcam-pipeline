from setuptools import setup, find_packages

setup(
    name="dashcam-pipeline",
    version="1.0.0",
    packages=find_packages(),
    entry_points={
        "console_scripts": [
            "dashcam-pipeline=src.main:main",
        ],
    },
    install_requires=[
        "opencv-python>=4.8.0",
        "ultralytics>=8.0.0",
        "numpy>=1.24.0",
        "Pillow>=10.0.0",
        "pytesseract>=0.3.10",
        "fastapi>=0.100.0",
        "uvicorn>=0.23.0",
    ],
)
