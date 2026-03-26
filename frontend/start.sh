#!/bin/sh
set -e

# BACKEND_URL can be full URL like https://backend.up.railway.app
# or we construct from BACKEND_HOST:BACKEND_PORT
BACKEND="${BACKEND_URL:-http://$BACKEND_HOST:$BACKEND_PORT}"
echo "Starting nginx on port $PORT, proxying API to $BACKEND"

# Extract hostname from BACKEND_URL for proxy Host header
BACKEND_HOSTNAME=$(echo "$BACKEND" | sed 's|https\?://||' | sed 's|:.*||' | sed 's|/.*||')
echo "Backend hostname for proxy: $BACKEND_HOSTNAME"

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
    listen $PORT;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    resolver 127.0.0.11 8.8.8.8 1.1.1.1 valid=10s;
    resolver_timeout 5s;

    location /api/ {
        set \$backend_url "$BACKEND";
        proxy_pass \$backend_url/api/;
        proxy_set_header Host $BACKEND_HOSTNAME;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        client_max_body_size 10M;
        proxy_read_timeout 120s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

echo "Generated nginx config:"
cat /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
