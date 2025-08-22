const express = require("express");
const { trace, metrics, logs } = require('@opentelemetry/api');
const app = express();

// Get tracer and meter
const tracer = trace.getTracer('observability-demo', '1.0.0');
const meter = metrics.getMeter('observability-demo', '1.0.0');

// Create custom metrics
const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

const httpRequestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'Duration of HTTP requests in seconds',
});

const activeConnections = meter.createUpDownCounter('active_connections', {
  description: 'Number of active connections',
});

// Middleware for request tracking
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Create a span for each request
  const span = tracer.startSpan(`${req.method} ${req.path}`);
  span.setAttributes({
    'http.method': req.method,
    'http.url': req.url,
    'http.user_agent': req.get('User-Agent') || 'unknown',
  });

  // Track metrics
  httpRequestsTotal.add(1, {
    method: req.method,
    endpoint: req.path,
  });

  activeConnections.add(1);

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    
    span.setAttributes({
      'http.status_code': res.statusCode,
      'http.response_size': res.get('Content-Length') || 0,
    });
    
    httpRequestDuration.record(duration, {
      method: req.method,
      endpoint: req.path,
      status_code: res.statusCode.toString(),
    });

    activeConnections.add(-1);
    span.end();
  });

  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Hello endpoint with variable delay
app.get("/hello", (req, res) => {
  const delay = Math.floor(Math.random() * 500);
  const span = trace.getActiveSpan();
  
  if (span) {
    span.addEvent('Processing hello request', { delay });
  }

  setTimeout(() => {
    res.json({ 
      message: "Hello, Observability from Node.js!", 
      delay,
      requestId: Math.random().toString(36).substr(2, 9)
    });
  }, delay);
});

// Endpoint that generates errors occasionally
app.get("/flaky", (req, res) => {
  const span = trace.getActiveSpan();
  const shouldFail = Math.random() < 0.3; // 30% chance of failure
  
  if (shouldFail) {
    const error = new Error("Simulated random error");
    span?.recordException(error);
    span?.setStatus({ code: 2, message: "Random error occurred" });
    
    console.error("Flaky endpoint error:", error.message);
    return res.status(500).json({ error: "Something went wrong!" });
  }

  span?.addEvent('Flaky endpoint succeeded');
  res.json({ 
    message: "Success!", 
    timestamp: new Date().toISOString(),
    success: true
  });
});

// CPU intensive endpoint
app.get("/cpu-intensive", (req, res) => {
  const span = trace.getActiveSpan();
  span?.addEvent('Starting CPU intensive operation');
  
  // Simulate CPU work
  const iterations = 1000000;
  let result = 0;
  
  for (let i = 0; i < iterations; i++) {
    result += Math.sqrt(i) * Math.random();
  }
  
  span?.addEvent('CPU intensive operation completed', { iterations, result });
  
  res.json({ 
    message: "CPU intensive operation completed",
    iterations,
    result: Math.round(result),
    timestamp: new Date().toISOString()
  });
});

// Memory usage endpoint
app.get("/memory", (req, res) => {
  const usage = process.memoryUsage();
  const span = trace.getActiveSpan();
  
  span?.setAttributes({
    'memory.heap_used': usage.heapUsed,
    'memory.heap_total': usage.heapTotal,
    'memory.external': usage.external,
  });

  res.json({
    memory: {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
      external: `${Math.round(usage.external / 1024 / 1024)} MB`,
      rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
    },
    timestamp: new Date().toISOString()
  });
});

// Endpoint with database simulation
app.get("/db-query", async (req, res) => {
  const span = tracer.startSpan('database_query');
  
  try {
    span.setAttributes({
      'db.system': 'postgresql',
      'db.operation': 'SELECT',
      'db.table': 'users',
    });

    // Simulate database query delay
    const queryTime = Math.floor(Math.random() * 200) + 50;
    await new Promise(resolve => setTimeout(resolve, queryTime));

    span.addEvent('Query executed successfully', { duration: queryTime });
    span.setStatus({ code: 1 });

    res.json({
      message: "Database query completed",
      queryTime: `${queryTime}ms`,
      data: [
        { id: 1, name: "John Doe", email: "john@example.com" },
        { id: 2, name: "Jane Smith", email: "jane@example.com" },
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    res.status(500).json({ error: "Database error" });
  } finally {
    span.end();
  }
});

// Metrics endpoint
app.get("/metrics-demo", (req, res) => {
  // Generate some random metrics
  const customMetric = meter.createGauge('demo_custom_value');
  customMetric.record(Math.random() * 100);

  const temperatureGauge = meter.createGauge('room_temperature_celsius');
  temperatureGauge.record(20 + Math.random() * 10);

  res.json({
    message: "Custom metrics generated",
    timestamp: new Date().toISOString(),
    values: {
      customValue: Math.random() * 100,
      temperature: 20 + Math.random() * 10
    }
  });
});

// Error 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  const span = trace.getActiveSpan();
  span?.recordException(err);
  
  console.error("Unhandled error:", err);
  
  res.status(500).json({
    error: "Internal Server Error",
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Observability API running on port ${PORT}`);
  console.log(`📊 Available endpoints:`);
  console.log(`  - GET /health - Health check`);
  console.log(`  - GET /hello - Basic hello with delay`);
  console.log(`  - GET /flaky - Random errors (30% failure rate)`);
  console.log(`  - GET /cpu-intensive - CPU intensive operation`);
  console.log(`  - GET /memory - Memory usage info`);
  console.log(`  - GET /db-query - Simulated database query`);
  console.log(`  - GET /metrics-demo - Generate custom metrics`);
});
