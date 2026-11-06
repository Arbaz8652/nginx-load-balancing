# nginx-load-balancing

A small Docker Compose lab that demonstrates dynamic, health-aware load balancing in front of a pool of Node.js app servers backed by Postgres.

## Architecture

- **node1 / node2 / node3** — identical Node.js HTTP servers (`app/server.js`). Each exposes:
  - `GET /` — sample JSON response with the instance ID.
  - `GET /health/live` — liveness probe.
  - `GET /health/ready` — readiness probe (checks the Postgres connection).
- **postgres** — backing database used for the readiness check.
- **health-checker** — a Node.js sidecar (`health-checker/checker.js`) that polls `/health/ready` on every node every 5s and regenerates `nginx/upstream.conf` in a shared volume (`nginx_config`), removing unhealthy nodes from the upstream pool.
- **nginx** — reverse proxy / load balancer (`nginx/default.conf`) that includes the generated `upstream.conf`. A `reload-watcher.sh` script inside the nginx container watches that file with `inotifywait`, validates it with `nginx -t`, and reloads nginx (`nginx -s reload`) whenever it changes — so unhealthy nodes are taken out of rotation without restarting the container.

## Project structure

```
app/server.js          # Node.js app (health endpoints + Postgres check)
Dockerfile              # Builds the node1/node2/node3 app image
nginx/
  Dockerfile            # nginx:alpine + inotify-tools
  default.conf           # Main nginx config, includes generated upstream.conf
  upstream.conf          # Seed upstream file (overwritten at runtime)
  reload-watcher.sh      # Watches upstream.conf and reloads nginx on change
health-checker/
  checker.js             # Polls node health, regenerates upstream.conf
  Dockerfile
docker-compose.yaml
```

## Getting started

```bash
# build and start everything (postgres, node1-3, nginx, health-checker)
docker compose up -d --build

# check container status
docker compose ps

# hit the load balancer
curl http://localhost:8080
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

## Useful commands

### Lifecycle

```bash
docker compose up -d --build            # start/rebuild all services
docker compose up -d --build <service>  # rebuild/start a single service (e.g. nginx, health-checker)
docker compose stop <service>           # stop a single service without removing it
docker compose start <service>          # start it back up
docker compose down                     # stop and remove all containers
```

### Logs & status

```bash
docker compose ps
docker compose ps -a
docker compose logs nginx
docker compose logs -f health-checker
docker compose logs --tail=100 nginx
docker compose config                   # print the fully resolved compose config
```

### Load balancing / failover testing

```bash
# send repeated requests and watch instance IDs rotate
for i in {1..20}; do curl -s http://localhost:8080; echo; done

# simulate a node going down and confirm it drops out of rotation
docker compose stop node2
for i in {1..20}; do curl -s http://localhost:8080; echo; done
docker compose start node2
```

### Inspecting nginx config / health state

```bash
docker compose exec nginx nginx -t                 # validate config
docker compose exec nginx nginx -s reload           # force a reload
docker compose exec health-checker cat /etc/nginx/generated/upstream.conf

# container health status
docker inspect <container_name_or_id> --format '{{json .State.Health}}'

# check volume mounts on the nginx container
docker inspect $(docker compose ps -q nginx) --format '{{json .Mounts}}'
```
