# Production Deployment Runbook
## Vishal Navigation - Enterprise Grade System

Complete step-by-step procedures for deploying to production with confidence.

---

## Pre-Deployment Checklist (48 hours before)

### Code Review & Testing
- [ ] All unit tests passing (100% pass rate)
- [ ] Integration tests passing
- [ ] Performance benchmarks passing (E2E <300ms)
- [ ] Security tests passing (OWASP Top 10 coverage)
- [ ] Code reviewed by 2+ team members
- [ ] No critical/high security issues in scan
- [ ] All dependencies up-to-date
- [ ] No breaking changes introduced
- [ ] Load testing completed (1000+ concurrent users)

### Infrastructure Preparation
- [ ] Production servers provisioned and tested
- [ ] Database backups automated
- [ ] Redis cluster configured (if enabled)
- [ ] CDN configured and tested
- [ ] DNS updated (TTL lowered to 300 seconds)
- [ ] SSL certificate valid and renewed
- [ ] Load balancer configured
- [ ] Health check endpoints working
- [ ] Monitoring dashboards created
- [ ] Alert thresholds configured

### Documentation & Team
- [ ] Deployment plan documented
- [ ] Rollback procedure documented
- [ ] Team trained on monitoring
- [ ] Incident response team on-call
- [ ] Communication channels established
- [ ] Status page updated to maintenance mode

---

## Deployment Day Timeline

### T-minus 2 hours: Final Checks

```bash
# Verify all systems operational
./scripts/health-check.sh

# Expected output:
# ✅ API Server: Healthy
# ✅ Database: Healthy
# ✅ Redis: Healthy
# ✅ CDN: Healthy
# ✅ Monitoring: Active

# Check current metrics
curl https://monitoring.internal/api/metrics

# Expected: All metrics within normal ranges
```

### T-minus 1 hour: Backup & Snapshot

```bash
# Create pre-deployment database backup
mysqldump --all-databases > /backups/pre-deploy-$(date +%s).sql

# Create VM snapshots
gcloud compute instances snapshot prod-api-1 --snapshot-names=pre-deploy-$(date +%s)
gcloud compute instances snapshot prod-api-2 --snapshot-names=pre-deploy-$(date +%s)
gcloud compute instances snapshot prod-db-1 --snapshot-names=pre-deploy-$(date +%s)

# Verify backups created
ls -lh /backups/pre-deploy-*
gcloud compute snapshots list | head -10

# Notify team
echo "Deployment commencing in 1 hour" | post-to-slack
```

### T-minute 0: Deployment Start

```bash
# 1. Pull latest code
cd /var/www/vishal-navigation
git fetch origin main
git checkout origin/main

# 2. Install/update dependencies
npm ci --production
npm run build

# 3. Run database migrations (if any)
npm run migrate:up

# 4. Verify deployment artifacts
npm run verify-build

# Expected output:
# ✅ Build artifacts verified
# ✅ No missing dependencies
# ✅ All migrations applied
```

### T+5 minutes: Canary Deployment (10% traffic)

```bash
# Update load balancer: 10% to new version, 90% to old
./scripts/set-traffic-split.sh prod-new 10 prod-old 90

# Monitor canary metrics
./scripts/monitor-canary.sh

# Expected:
# - Error rate: <0.1%
# - Latency P95: <500ms
# - No increase in exceptions
# - Cache hit rate: >85%

# This phase lasts 10 minutes
sleep 600
```

### T+15 minutes: Gradual Rollout (50% traffic)

```bash
# If canary metrics good, increase to 50%
./scripts/set-traffic-split.sh prod-new 50 prod-old 50

# Monitor metrics
./scripts/monitor-deployment.sh

# Expected:
# - Error rate: <0.1%
# - Latency P95: <500ms
# - Database performance: normal
# - Cache hit rate: >85%

# This phase lasts 15 minutes
sleep 900
```

### T+30 minutes: Full Rollout (100% traffic)

```bash
# If 50% metrics good, go to 100%
./scripts/set-traffic-split.sh prod-new 100

# Final verification
npm run smoke-tests

# Expected tests:
# ✅ API responding
# ✅ Database connectivity
# ✅ Cache working
# ✅ External APIs reachable
# ✅ Address verification working
# ✅ STT working
# ✅ All core features functional

echo "Deployment 100% complete" | post-to-slack
```

---

## Post-Deployment Verification (1 hour)

### Automated Checks

```bash
# 1. System Health
./scripts/health-check.sh

# 2. Performance Metrics
./scripts/check-performance.sh
# Expected:
# - E2E latency P50: <200ms
# - E2E latency P95: <300ms
# - Cache hit rate: >85%
# - API response time: <100ms

# 3. Error Monitoring
./scripts/check-errors.sh
# Expected:
# - Error rate: <0.1%
# - No new error patterns
# - No spike in exceptions

# 4. Database Health
./scripts/check-database.sh
# Expected:
# - Query performance: normal
# - Replication lag: <100ms
# - Connections: healthy

# 5. Log Analysis
./scripts/analyze-logs.sh --hours=1
# Expected:
# - No security warnings
# - No circuit breakers tripped
# - Rate limits: normal
```

### Manual Verification

```bash
# Test key user flows
curl -X POST https://api.vishal-navigation.com/api/verify-address \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"address": "123 Main Street", "pincode": "110001"}'
# Expected: { "valid": true, "confidence": 0.95 }

# Check agent dashboard
curl https://dashboard.vishal-navigation.com/api/agents
# Expected: All agents showing as "online"

# Test rate limiting
for i in {1..50}; do
  curl -s https://api.vishal-navigation.com/api/status \
    -H "Authorization: Bearer $TOKEN" > /dev/null
done
# Expected: Last few requests return 429 (rate limited)
```

---

## Monitoring Setup (Ongoing)

### Key Metrics Dashboard

```javascript
// Create monitoring dashboard with these metrics

const metricsToMonitor = {
  availability: {
    uptime: 'Target: 99.9%',
    errorRate: 'Target: <0.1%',
    healthChecks: 'Every 30 seconds'
  },

  performance: {
    sttLatency: 'P95: <200ms (target)',
    parsingLatency: 'P95: <50ms (target)',
    verificationLatency: 'P95: <50ms (target)',
    e2eLatency: 'P95: <300ms (target)',
    cacheHitRate: 'Target: >85%'
  },

  resources: {
    cpuUsage: 'Alert if >80%',
    memoryUsage: 'Alert if >85%',
    diskUsage: 'Alert if >90%',
    networkBandwidth: 'Monitor for spikes'
  },

  business: {
    addressesVerified: 'Count per hour',
    agentsActive: 'Count',
    revenue: 'Cost savings from optimization'
  }
};
```

### Alert Configuration

```yaml
# Prometheus alert rules
groups:
  - name: vishal_navigation
    rules:
      - alert: HighErrorRate
        expr: rate(errors_total[5m]) > 0.001
        for: 5m
        annotations:
          summary: "High error rate detected"
          
      - alert: HighLatency
        expr: histogram_quantile(0.95, latency_ms) > 300
        for: 10m
        annotations:
          summary: "E2E latency above target"
          
      - alert: LowCacheHitRate
        expr: cache_hit_rate < 0.85
        for: 15m
        annotations:
          summary: "Cache hit rate below target"
          
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state == 1
        for: 1m
        annotations:
          summary: "Circuit breaker opened"
```

### Notification Channels

```javascript
const notifications = {
  critical: {
    channels: ['pagerduty', 'slack', 'sms', 'email'],
    escalation: 'Page on-call engineer'
  },
  high: {
    channels: ['slack', 'email'],
    escalation: 'Notify team after 15 min'
  },
  medium: {
    channels: ['slack'],
    escalation: 'Review during next standup'
  },
  low: {
    channels: ['monitoring-dashboard'],
    escalation: 'None'
  }
};
```

---

## Rollback Procedure (If Issues Detected)

### Automatic Rollback (Triggered if)

```javascript
const autoRollbackTriggers = {
  errorRate: {
    threshold: 0.5,      // 0.5% error rate
    duration: '5 min'
  },
  latency: {
    p95: 1000,           // >1 second
    duration: '5 min'
  },
  serviceDown: {
    healthCheckFails: 3  // 3 consecutive failures
  },
  criticalError: {
    pattern: 'FATAL|CRITICAL|OOM'
  }
};
```

### Manual Rollback Command

```bash
# OPTION 1: Immediate rollback to previous version
./scripts/rollback.sh --to=previous --force

# OPTION 2: Rollback to specific version
./scripts/rollback.sh --to=v1.2.3

# OPTION 3: Rollback to snapshot
gcloud compute instances create prod-api-1-rollback \
  --source-snapshot=pre-deploy-$(date +%s) \
  --zone=us-central1-a

# Verify rollback
./scripts/health-check.sh
npm run smoke-tests

# Notify team
echo "⚠️ Deployment rolled back to previous version" | post-to-slack
```

### Post-Rollback Analysis

```bash
# 1. Collect logs from failed deployment
journalctl -u vishal-navigation --since "30 min ago" > /logs/deployment-failure.log

# 2. Check for errors
grep -i "error\|exception\|fatal" /logs/deployment-failure.log

# 3. Review metrics during failure
./scripts/get-metrics.sh --since="30 min ago" > /analysis/metrics-failure.json

# 4. Create incident report
cat > /incidents/deployment-failure-$(date +%Y%m%d).md << EOF
## Deployment Failure Report

### Trigger Time
$(date)

### Rollback Time
[Record actual time]

### Root Cause
[To be determined]

### Error Details
[Paste relevant logs]

### Action Items
1. [Item 1]
2. [Item 2]
EOF

# 5. Schedule post-mortem
echo "Post-mortem scheduled for tomorrow 10 AM" | post-to-slack
```

---

## Database Migration Procedure

### Pre-Migration

```bash
# 1. Create backup
mysqldump vishal_navigation > /backups/pre-migration.sql

# 2. Verify migration scripts
npm run migrate:verify

# 3. Test migration on staging
./scripts/run-staging-migration.sh
npm run smoke-tests --env=staging

# 4. Notify users
curl -X POST https://api.vishal-navigation.com/api/maintenance \
  -d '{"status": "pre-maintenance", "eta_minutes": 30}'
```

### Migration Execution

```bash
# 1. Enable read-only mode
./scripts/enable-read-only.sh

# 2. Run migrations
npm run migrate:up

# Expected:
# - All migrations applied successfully
# - No errors or rollbacks

# 3. Verify schema
npm run verify-schema

# Expected:
# - Schema matches expected state
# - No dangling foreign keys
# - All indices created

# 4. Run integrity checks
npm run verify-data-integrity

# 5. Disable read-only mode
./scripts/disable-read-only.sh

# 6. Update status
curl -X POST https://api.vishal-navigation.com/api/maintenance \
  -d '{"status": "complete"}'
```

---

## Scaling Procedures

### Horizontal Scaling (Add More Instances)

```bash
# 1. Create new instance from golden image
./scripts/create-instance.sh prod-api-3

# 2. Wait for instance to be ready
./scripts/wait-for-instance.sh prod-api-3

# 3. Add to load balancer
./scripts/add-to-load-balancer.sh prod-api-3

# 4. Verify health
curl https://prod-api-3.internal/health
# Expected: { "status": "healthy" }

# 5. Monitor metrics
./scripts/monitor-instance.sh prod-api-3 --duration=5m

# 6. If all good, it automatically receives traffic
```

### Vertical Scaling (Increase Resources)

```bash
# 1. Add more memory/CPU to cache nodes
gcloud compute instances update prod-cache-1 \
  --machine-type=n1-standard-8

# 2. Restart service
systemctl restart redis-server

# 3. Verify
redis-cli info stats | grep memory
```

---

## Performance Tuning (Post-Deployment)

### Monitor Performance Metrics

```bash
# Check if targets are met
./scripts/check-performance.sh --targets

# Expected output for each metric:
# ✅ STT latency P95: 200ms (target: <200ms)
# ✅ Parsing latency P95: 45ms (target: <50ms)
# ✅ Verification latency P95: 48ms (target: <50ms)
# ✅ E2E latency P95: 293ms (target: <300ms)
# ✅ Cache hit rate: 87% (target: >85%)
```

### If Performance Below Target

```bash
# 1. Identify bottleneck
./scripts/profile-performance.sh

# 2. Check cache effectiveness
redis-cli info stats
# Should show: hit rate > 85%, evicted keys < 1%

# 3. Check rate limiting impact
curl https://monitoring.internal/api/rate-limiter-stats
# Should show: rejection rate < 1%

# 4. Review slow queries
mysql -e "SELECT * FROM information_schema.processlist \
  WHERE TIME > 5 ORDER BY TIME DESC LIMIT 10;"

# 5. Adjust caching TTLs if needed
# Edit PERFORMANCE_OPTIMIZATION_GUIDE.md
```

---

## Maintenance Windows

### Scheduled Maintenance (Monthly)

```bash
# 1. Schedule announcement
./scripts/announce-maintenance.sh --duration=2hours --date="2026-07-15 02:00"

# 2. At scheduled time, enable maintenance mode
./scripts/enable-maintenance-mode.sh

# 3. Perform tasks:
#    - Update dependencies
#    - Clean up logs
#    - Optimize database
#    - Update certificates
#    - Rotate keys

# 4. Run full test suite
npm test

# 5. Disable maintenance mode
./scripts/disable-maintenance-mode.sh

# 6. Verify all systems
./scripts/health-check.sh
npm run smoke-tests
```

### Emergency Maintenance

```bash
# If critical security issue found:

# 1. Immediately notify stakeholders
echo "🚨 SECURITY ISSUE - Emergency maintenance starting" | post-to-slack --critical

# 2. Enable maintenance mode
./scripts/enable-maintenance-mode.sh --force

# 3. Apply security patch
git checkout patch-branch
npm ci
npm run build

# 4. Deploy patch
npm run deploy

# 5. Verify security fix
npm run security-test

# 6. Re-enable service
./scripts/disable-maintenance-mode.sh

# 7. Post-incident review
./scripts/create-incident-report.sh
```

---

## Disaster Recovery

### Complete Service Failure

```bash
# 1. Declare incident
./scripts/declare-incident.sh --severity=critical

# 2. Start rollback immediately
./scripts/rollback.sh --to=last-known-good --force

# 3. If rollback fails, restore from backup
./scripts/restore-from-backup.sh --backup=/backups/pre-deploy-*.sql

# 4. Rebuild from last known state
gcloud compute instances create prod-api-1-recovered \
  --source-snapshot=latest-valid-snapshot \
  --zone=us-central1-a

# 5. Redirect traffic to recovered instance
./scripts/update-dns.sh --target=recovered-instance

# 6. Verify service
./scripts/health-check.sh --retries=10
npm run smoke-tests

# 7. Document incident
./scripts/create-incident-report.sh --severity=sev1
```

---

## Post-Deployment Checklist (24 hours after)

- [ ] Error rate stable at <0.1%
- [ ] All performance metrics on target
- [ ] No unusual resource usage
- [ ] No security alerts triggered
- [ ] User feedback positive (monitor support tickets)
- [ ] All agents reporting normal operation
- [ ] Cache hit rate >85%
- [ ] No circuit breakers tripped
- [ ] Database performance nominal
- [ ] All backups completed successfully
- [ ] Incident report filed (if any issues)
- [ ] Team debriefing completed

---

## Success Criteria

✅ **Deployment Successful If:**

1. ✅ Service deployed to 100% of instances
2. ✅ Error rate <0.1% for first 24 hours
3. ✅ All performance targets met
4. ✅ No new bugs reported
5. ✅ No security issues detected
6. ✅ Zero unplanned rollbacks
7. ✅ User experience unchanged or improved
8. ✅ Cost metrics within projections
9. ✅ All monitoring alerts properly configured
10. ✅ Rollback procedures verified and documented

---

## Contact Information

### On-Call Support
- **Primary**: [Engineer Name] - [Phone/Slack]
- **Secondary**: [Engineer Name] - [Phone/Slack]
- **Escalation**: [Manager Name] - [Phone/Slack]

### Emergency Contacts
- **CEO**: [Contact]
- **CTO**: [Contact]
- **Security**: [Contact]

### Documentation
- **Runbook**: This document
- **Architecture**: architecture-diagram.md
- **API Reference**: API_REFERENCE.md
- **Security**: SECURITY_HARDENING_GUIDE.md

---

**Ready for Production Deployment** ✅

All procedures documented and tested. Team trained and prepared.
