# Pipe MVP Quick Summary

## 🎯 V0 Focus: GitHub + Slack Context Bridge

### Core Features (5 weeks to build)
1. **MCP Server** with basic protocol implementation
2. **GitHub + Slack OAuth** authentication
3. **Cross-platform search** tool for Claude/Cursor
4. **Automatic linking** of PRs to Slack discussions

### What We're NOT Building (Yet)
- No Jira/Linear/Notion (V1)
- No AI synthesis (V1) 
- No complex visualizations
- No enterprise features

## 🚀 5-Week Sprint Plan

**Weeks 1-2:** Core infrastructure (MCP server + auth)
**Weeks 3-4:** GitHub + Slack integrations
**Week 5:** Testing, deploy to DigitalOcean/VPS

## 💰 Go-to-Market Strategy

1. **Alpha (Week 6):** 10-20 developer friends
2. **Beta (Week 7-8):** Launch on HN, Reddit, Twitter (target: 100 users)
3. **Product Hunt (Week 9):** Public launch (target: 500 users)

## 📊 Success Metrics

- **Week 1:** 10 users, working search
- **Week 4:** 100 users, 50% retention  
- **Week 8:** 500 users, $3K MRR

## 🏗️ Simple Infrastructure

```
Cloudflare → Single VPS (4GB) → PostgreSQL + Redis (Docker)
```

Total monthly cost: ~$40 (can handle 500 users)

## 💵 Pricing After Beta

- **Free:** 3 users, 100 searches/day
- **Team:** $15/user/month, unlimited
- **Enterprise:** Custom

## ⚡ Key Success Factor

**5-minute setup that actually works** → Immediate "aha!" moment when first search returns connected context from both platforms.

---

**Next Action:** Start building the core MCP server this week!