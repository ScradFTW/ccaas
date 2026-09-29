FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends squid \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /etc/squid/acl.d

COPY squid.conf /etc/squid/squid.conf

EXPOSE 3128

# Clear a stale PID file first: the container keeps its writable layer
# across a VM stop/start (restart policy unless-stopped), and Squid then
# refuses to start ("Squid is already running: Found fresh instance PID
# file ... with PID 1") and restart-loops forever.
CMD ["sh", "-c", "rm -f /run/squid.pid && exec squid -N -d 1"]
