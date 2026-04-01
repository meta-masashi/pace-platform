// Package handler provides HTTP endpoints for the inference engine.
package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"runtime"
	"time"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/config"
	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
	"github.com/meta-masashi/pace-platform/pace-inference/internal/pipeline"
)

// Handler holds the pipeline and serves HTTP requests.
type Handler struct {
	pipeline *pipeline.Pipeline
	logger   *slog.Logger
}

// New creates a handler with the given config.
func New(cfg config.PipelineConfig, logger *slog.Logger) *Handler {
	return &Handler{
		pipeline: pipeline.New(cfg),
		logger:   logger,
	}
}

// RegisterRoutes sets up HTTP routes on the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /v6/infer", h.handleInfer)
	mux.HandleFunc("GET /health", h.handleHealth)
}

// POST /v6/infer — Execute inference pipeline.
func (h *Handler) handleInfer(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	// Panic recovery
	defer func() {
		if err := recover(); err != nil {
			h.logger.Error("panic in inference handler", "error", err)
			w.Header().Set("X-Engine-Status", "panic")
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":    "internal engine error",
				"fallback": "use_typescript",
			})
		}
	}()

	// Parse request
	var req domain.InferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.logger.Warn("invalid request body", "error", err)
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON body"})
		return
	}

	// Validate required fields
	if req.AthleteContext.AthleteID == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "athlete_context.athlete_id is required"})
		return
	}

	// Execute pipeline
	ctx := context.Background()
	output, err := h.pipeline.Execute(ctx, req.DailyInput, req.AthleteContext, req.History)
	if err != nil {
		h.logger.Error("pipeline execution failed", "error", err, "athlete_id", req.AthleteContext.AthleteID)
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "pipeline execution failed"})
		return
	}

	elapsed := time.Since(start).Milliseconds()
	h.logger.Info("inference completed",
		"athlete_id", req.AthleteContext.AthleteID,
		"decision", output.Decision.Decision,
		"priority", output.Decision.Priority,
		"confidence", output.Decision.ConfidenceLevel,
		"expert_review", output.ExpertReviewRequired,
		"trends", len(output.TrendNotices),
		"latency_ms", elapsed,
	)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Engine", "go")
	w.Header().Set("X-Latency-Ms", time.Since(start).String())
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"data":    output,
	})
}

// GET /health — Liveness probe.
func (h *Handler) handleHealth(w http.ResponseWriter, _ *http.Request) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	memMB := float64(m.Alloc) / 1024 / 1024
	if memMB > 512 {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":    "unhealthy",
			"reason":    "memory exceeded 512MB",
			"memory_mb": memMB,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":    "ok",
		"version":   "v6.0-go",
		"memory_mb": memMB,
	})
}
