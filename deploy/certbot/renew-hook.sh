#!/usr/bin/env bash
# Post-renewal hook for certbot — reloads nginx to pick up new certs
systemctl reload nginx
