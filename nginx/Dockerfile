FROM nginx:alpine

RUN apk add --no-cache inotify-tools

COPY reload-watcher.sh /reload-watcher.sh

RUN chmod +x /reload-watcher.sh

CMD ["/bin/sh", "-c", "/reload-watcher.sh & exec nginx -g 'daemon off;'"]