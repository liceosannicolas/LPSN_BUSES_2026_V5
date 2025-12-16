# LPSN · Transporte Escolar 2026 (V4 Sync Oficial)

## Objetivo
- **Admin** carga la nómina **una sola vez** en Google Sheets (Sync).
- **Digitadores** solo: **RUT → asignar bus** (control de cupos + lista de espera).
- Dashboards por **Bus** y por **Curso**.

## Credenciales (locales)
- belenacuna@liceosannicolas.cl / Buses2026 (digitador)
- echeverri@liceosannicolas.cl / Buses2026 (digitador)
- franciscopinto@liceosannicolas.cl / Buses2026 (admin)

> La autenticación es local (front-end). La seguridad real se gestiona por acceso al Google Sheet/Apps Script y API_KEY.

## Setup Sync (Apps Script)
1. Crea un Google Sheet.
2. Extensiones → Apps Script.
3. Copia `backend/AppsScript.gs`.
4. Project Settings → Script properties: `API_KEY` = tu clave.
5. Deploy → New deployment → Web app:
   - Execute as: Me
   - Who has access: Anyone with the link
6. Copia la URL /exec.

## Configurar en cada PC
- Abrir `app/settings.html` y pegar URL + API key.

## Cargar nómina (Admin)
- Subir el Excel a Drive (una vez).
- En `app/admin.html` pegar link o ID y presionar **Importar**.

## Operación digitadores
- `app/dashboard.html`:
  - Buscar por RUT.
  - Seleccionar bus.
  - Asignar (si no hay cupos, queda EN_ESPERA).

## Hojas en Google Sheets (Sync)
- Estudiantes
- Buses
- Asignaciones
- En_espera
- BUS_<ID> (se crea automáticamente al asignar)

