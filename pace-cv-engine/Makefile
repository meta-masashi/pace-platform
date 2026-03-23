.PHONY: dev test lint typecheck build push-ecr

# Local dev
dev:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8080

worker:
	python -m app.worker

# Quality
test:
	pytest tests/ -v --cov=app --cov-report=term-missing

lint:
	ruff check app/ tests/

typecheck:
	mypy app/

# Docker
build:
	docker build -t pace-cv-engine:local .

gpu-verify:
	docker run --gpus all --rm pace-cv-engine:local python gpu_verify.py

# ECR push (CI only)
push-ecr: build
	aws ecr get-login-password --region ap-northeast-1 | \
	  docker login --username AWS --password-stdin $$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-northeast-1.amazonaws.com
	docker tag pace-cv-engine:local $(ECR_REGISTRY)/pace-cv-engine:$(IMAGE_TAG)
	docker push $(ECR_REGISTRY)/pace-cv-engine:$(IMAGE_TAG)
