FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends squid \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /etc/squid/acl.d

COPY squid.conf /etc/squid/squid.conf

EXPOSE 3128

CMD ["squid", "-N", "-d", "1"]
