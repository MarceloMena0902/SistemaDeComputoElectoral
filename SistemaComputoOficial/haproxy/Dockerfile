FROM haproxy:2.8-alpine
USER root
COPY haproxy.cfg /usr/local/etc/haproxy/haproxy.cfg
RUN echo "" >> /usr/local/etc/haproxy/haproxy.cfg
EXPOSE 5000 5001 7000