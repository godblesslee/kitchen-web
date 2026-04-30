# kitchen.ladder.pub DNS record
# Add to your Alibaba Cloud DNS:

# TYPE   NAME               VALUE
# A      kitchen            [SERVER_IP]
# or
# CNAME  kitchen            ladder.pub

# Then on the server:
# 1. Copy files:
#    scp deploy/nginx-kitchen.conf root@47.76.250.17:/etc/nginx/sites-available/kitchen
#    scp deploy/kitchen.service root@47.76.250.17:/etc/systemd/system/kitchen.service

# 2. On the server:
#    ln -s /etc/nginx/sites-available/kitchen /etc/nginx/sites-enabled/
#    nginx -t && systemctl reload nginx
#    mkdir -p /var/www/kitchen
#    systemctl daemon-reload
#    systemctl enable kitchen

# 3. Build locally and deploy:
#    bash deploy.sh
