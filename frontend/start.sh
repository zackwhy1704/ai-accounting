#!/bin/sh
set -e

echo "Starting nginx on port $PORT, proxying API to $BACKEND_HOST:$BACKEND_PORT"

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
    listen $PORT;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    resolver 8.8.8.8 1.1.1.1 valid=10s;
    resolver_timeout 5s;

    location /api/ {
        set \$backend_url "http://$BACKEND_HOST:$BACKEND_PORT";
        proxy_pass \$backend_url/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
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
