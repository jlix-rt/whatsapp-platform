# Configuración de Nginx para Uploads de Archivos

## Problema

Si recibes el error `413 Request Entity Too Large` al intentar subir archivos, significa que nginx está rechazando la petición antes de que llegue al backend.

## Solución

Necesitas aumentar el límite `client_max_body_size` en la configuración de nginx.

### Opción 1: Configuración Global (Recomendado)

Edita el archivo de configuración principal de nginx (generalmente `/etc/nginx/nginx.conf`):

```nginx
http {
    # ... otras configuraciones ...
    
    # Aumentar el límite de tamaño de body para permitir uploads
    client_max_body_size 50M;
    
    # ... resto de la configuración ...
}
```

### Opción 2: Configuración por Servidor Virtual

Si prefieres configurarlo solo para tu dominio específico, edita el archivo de configuración del sitio (generalmente en `/etc/nginx/sites-available/tu-sitio`):

```nginx
server {
    listen 80;
    server_name *.inbox.tiendasgt.com *.tiendasgt.com;

    # Aumentar el límite de tamaño de body
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3333;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts extendidos para uploads grandes
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

### Opción 3: Configuración Solo para Endpoints de Uploads

Si solo quieres permitir archivos grandes en endpoints específicos:

```nginx
server {
    listen 80;
    server_name *.inbox.tiendasgt.com *.tiendasgt.com;

    # Límite por defecto (1MB)
    client_max_body_size 1M;

    location / {
        proxy_pass http://localhost:3333;
        # ... otras configuraciones ...
    }

    # Límite mayor solo para endpoints de uploads
    location /api/conversations/ {
        client_max_body_size 50M;
        proxy_pass http://localhost:3333;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        # ... otras configuraciones ...
    }
}
```

## Aplicar los Cambios

Después de editar la configuración de nginx:

1. **Verificar la configuración:**
   ```bash
   sudo nginx -t
   ```

2. **Recargar nginx:**
   ```bash
   sudo systemctl reload nginx
   # O alternativamente:
   sudo service nginx reload
   ```

## Límites Configurados

- **Backend (multer)**: 10MB por archivo
- **Nginx (recomendado)**: 50MB para tener margen
- **Express body parser**: 50MB

## Notas

- El límite de nginx debe ser mayor o igual al límite del backend
- Los timeouts también deben ser suficientes para uploads grandes
- Si usas HTTPS, asegúrate de configurar también el bloque `server` para el puerto 443
