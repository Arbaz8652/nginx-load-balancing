#!/bin/sh

CONFIG_DIR="/etc/nginx/generated"
CONFIG_FILE="$CONFIG_DIR/upstream.conf"

echo "Watching for changes in $CONFIG_FILE"

while [ ! -s /var/run/nginx.pid ]; do
  sleep 0.2
done


while true; do 
  changed_file=$(inotifywait \
    -q \
    -e moved_to,close_write \
    --format '%f' \
    "$CONFIG_DIR")

  if [ "$changed_file" = "upstream.conf" ]; then
    continue
  fi

  echo "Upstream configuration changed, Validating...."

  if [ ! -s "$CONFIG_FILE" ]; then
    echo "Configuration file is empty or missing. Skipping reload."
    continue
  fi

  if nginx -t ; then
    echo "Configuration is valid. Reloading Nginx..."
    nginx -s reload
    echo "Nginx reloaded successfully."
  else
    echo "Invalid configuration. Keeping previous configuration."
  fi
done