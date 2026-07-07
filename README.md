# Dashboard ARI CLARO | Alucinando Agency

Dashboard de resultados en tiempo real para **ARI CLARO**, desarrollado por **Alucinando Marketing**.

## Características
- Dashboard único de **LEADS**: gasto de Meta Ads + conteo combinado de resultados, con Costo/Lead calculado internamente (no viene de Meta).
- Integración directa con Meta Ads Graph API a **nivel de campaña** (spend, alcance, clics, visitas).
- Filtra las campañas para quedarse **solo con las de objetivo Leads** (`OUTCOME_LEADS`/`LEAD_GENERATION`), leyendo el `objective` real de cada campaña vía la API — el gasto de campañas de Mensajes u otros objetivos nunca se mezcla con el de Leads.
- El conteo de "Leads" = leads nativos de Meta (`action_type=lead`, solo de esas campañas) **+** oportunidades de GoHighLevel (GHL) del pipeline/stage configurado ("Se realiza la llamada").
- Selector de rango de fechas (Hoy, Ayer, Últimos 7/14/30 días, Este mes, Mes anterior, o rango personalizado) que filtra Meta y GHL de forma consistente.
- Análisis multicuenta (cualquier cantidad de Ad Accounts de Meta, corridas en paralelo).
- Seguimiento de presupuesto mensual (PEN).
- Gráficos interactivos con tendencias y comparativas.

## Requisitos
- Python 3.8+
- Token de acceso a la API de Meta Ads con permisos `ads_read` sobre las cuentas configuradas.
- API Key (Private Integration Token) de GoHighLevel con acceso a `opportunities`.

## Instalación
1. Clonar el repositorio:
   ```bash
   git clone https://github.com/Wolf-Negro/dashboard-ariclaro.git
   ```
2. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```
3. Configurar variables de entorno:
   Copiar `.env.example` a `.env` y completar los valores de Meta Ads y GHL (`GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, `GHL_STAGE_ID`).
   `AD_ACCOUNT_IDS` acepta cualquier cantidad de cuentas separadas por coma (`act_111,act_222,act_333`); también acepta los IDs sin el prefijo `act_`.

### Nota sobre GHL
La API de oportunidades de GHL no soporta filtro por fecha, así que el backend pagina el pipeline/stage configurado (vía `meta.nextPageUrl`). Como GHL devuelve las oportunidades ordenadas por `createdAt` **descendente**, la paginación se corta en cuanto la última oportunidad de una página ya es más antigua que el `since` pedido — evita traer miles de registros históricos irrelevantes en cada request (con pipelines grandes, traerlos todos puede tardar >20s y reventar el timeout de una función serverless).

### Nota sobre el filtro de campañas
El backend llama a `/{ad_account}/campaigns?fields=objective` para cada cuenta (en paralelo, un hilo por cuenta) y clasifica cada campaña antes de sumar su gasto. Solo las campañas con objetivo `OUTCOME_LEADS`/`LEAD_GENERATION` entran al cálculo; el resto (Mensajes, Ventas, etc.) queda fuera. Si Meta agrega nuevas nomenclaturas de objetivo, hay que sumarlas a `LEADS_OBJECTIVES` en `app.py`.

## Ejecución
```bash
python app.py
```

## Créditos
Desarrollado para **ARI CLARO** por **Alucinando Marketing**.
