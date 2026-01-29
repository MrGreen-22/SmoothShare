FROM docker.arvancloud.ir/nginx

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY ./nginx-configs/settings.conf /etc/nginx/conf.d/default.conf

# Copy frontend
COPY ./app /app
