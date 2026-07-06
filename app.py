import os
from flask import Flask, render_template, jsonify, request
import requests
from datetime import datetime, timedelta
import pytz
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

app = Flask(__name__)

# Configuración de Meta Ads
ACCESS_TOKEN = os.environ.get('META_ACCESS_TOKEN')

def _normalize_account_id(acc):
    """Meta requiere el prefijo 'act_'; lo agregamos si solo viene el ID numérico
    (ej. copiado del parámetro ?act=... de la URL de Ads Manager)."""
    acc = acc.strip()
    if acc and not acc.startswith('act_'):
        acc = f'act_{acc}'
    return acc

# Soporte para múltiples cuentas (cualquier cantidad):
# 1) AD_ACCOUNT_IDS="act_111,act_222,act_333" (preferido, sin límite de cuentas)
# 2) AD_ACCOUNT_ID_1, AD_ACCOUNT_ID_2, AD_ACCOUNT_ID_3... (compatibilidad, numerado)
_raw_ids = os.environ.get('AD_ACCOUNT_IDS', '')
AD_ACCOUNT_IDS = [acc for acc in _raw_ids.split(',') if acc.strip()]

if not AD_ACCOUNT_IDS:
    i = 1
    while True:
        acc = os.environ.get(f'AD_ACCOUNT_ID_{i}')
        if not acc:
            break
        AD_ACCOUNT_IDS.append(acc)
        i += 1

AD_ACCOUNT_IDS = [_normalize_account_id(acc) for acc in AD_ACCOUNT_IDS if acc.strip()]

MONTHLY_BUDGET = float(os.environ.get('MONTHLY_BUDGET', 12000))
CLIENT_NAME = os.environ.get('CLIENT_NAME', 'ARI CLARO')
CURRENCY = os.environ.get('CURRENCY', 'PEN')

# Configuración de GoHighLevel (GHL)
GHL_API_KEY = os.environ.get('GHL_API_KEY')
GHL_LOCATION_ID = os.environ.get('GHL_LOCATION_ID')
GHL_PIPELINE_ID = os.environ.get('GHL_PIPELINE_ID')
GHL_STAGE_ID = os.environ.get('GHL_STAGE_ID')
GHL_BASE_URL = os.environ.get('GHL_BASE_URL', 'https://services.leadconnectorhq.com')
GHL_API_VERSION = '2021-07-28'

PERU_TZ = pytz.timezone('America/Lima')

def get_peru_now():
    """Retorna datetime actual en America/Lima."""
    return datetime.now(PERU_TZ)

def date_range_list(since_str, until_str):
    """Devuelve la lista de fechas (YYYY-MM-DD) entre since y until, inclusive."""
    start = datetime.strptime(since_str, '%Y-%m-%d')
    end = datetime.strptime(until_str, '%Y-%m-%d')
    days = []
    cur = start
    while cur <= end:
        days.append(cur.strftime('%Y-%m-%d'))
        cur += timedelta(days=1)
    return days

def fetch_ghl_opportunities():
    """Trae TODAS las oportunidades del pipeline/stage configurado en GHL, paginando
    con meta.nextPageUrl (la API de GHL no soporta filtro de fecha en la búsqueda)."""
    if not (GHL_API_KEY and GHL_LOCATION_ID and GHL_PIPELINE_ID):
        print("ADVERTENCIA: faltan variables de entorno de GHL (GHL_API_KEY / GHL_LOCATION_ID / "
              "GHL_PIPELINE_ID) — Mensajes se mostrará en 0 hasta que se configuren.")
        return []

    headers = {
        'Authorization': f'Bearer {GHL_API_KEY}',
        'Version': GHL_API_VERSION,
        'Accept': 'application/json'
    }

    base_params = {
        'location_id': GHL_LOCATION_ID,
        'pipeline_id': GHL_PIPELINE_ID,
        'limit': 100
    }
    if GHL_STAGE_ID:
        base_params['pipeline_stage_id'] = GHL_STAGE_ID

    all_opportunities = []
    next_url = f"{GHL_BASE_URL}/opportunities/search"
    params = base_params

    while next_url:
        try:
            response = requests.get(next_url, headers=headers, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            print(f"Error fetching GHL opportunities: {e}")
            break

        all_opportunities.extend(data.get('opportunities', []))

        next_url = data.get('meta', {}).get('nextPageUrl')
        params = None  # nextPageUrl ya trae sus propios query params

    return all_opportunities

def process_ghl_data(opportunities, since_date, until_date):
    """Agrupa oportunidades por fecha de creación (America/Lima, UTC-5 fijo)
    y cuenta solo las que caen dentro de [since_date, until_date]."""
    daily_counts = {}
    for opp in opportunities:
        created_at = opp.get('createdAt') or opp.get('dateAdded')
        if not created_at:
            continue
        try:
            dt_utc = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        except ValueError:
            continue
        dt_lima = dt_utc.astimezone(PERU_TZ)
        date_str = dt_lima.strftime('%Y-%m-%d')
        if since_date <= date_str <= until_date:
            daily_counts[date_str] = daily_counts.get(date_str, 0) + 1
    return daily_counts

def process_meta_data(data):
    """Procesa insights de Meta (spend, leads, alcance, clics, visitas) y
    devuelve un array formateado por fecha. Recibe una lista ya filtrada
    (por bucket de objetivo) y simplemente agrega por date_start."""
    processed = []
    # Agrupar por fecha ya que podemos tener múltiples cuentas/campañas
    by_date = {}

    for day_entry in data:
        date_str = day_entry.get('date_start')
        spend = float(day_entry.get('spend', 0.0))
        leads = 0
        visits = 0
        actions = day_entry.get('actions', [])
        for action in actions:
            # Leads nativos de Meta (formularios de clientes potenciales)
            if action['action_type'] == 'lead':
                leads += int(action['value'])
            # Visitas a la página (Landing Page Views)
            if action['action_type'] == 'landing_page_view':
                visits += int(action['value'])

        ctr = float(day_entry.get('unique_inline_link_click_ctr', day_entry.get('inline_link_click_ctr', 0.0)))
        reach = int(day_entry.get('reach', 0))
        impressions = int(day_entry.get('impressions', 0))
        clicks = int(day_entry.get('clicks', 0))

        if date_str not in by_date:
            by_date[date_str] = {
                "spend": 0.0,
                "leads": 0,
                "visits": 0,
                "ctr_sum": 0.0,
                "ctr_count": 0,
                "reach": 0,
                "impressions": 0,
                "clicks": 0
            }

        by_date[date_str]["spend"] += spend
        by_date[date_str]["leads"] += leads
        by_date[date_str]["visits"] += visits
        by_date[date_str]["ctr_sum"] += ctr
        by_date[date_str]["ctr_count"] += 1
        by_date[date_str]["reach"] += reach
        by_date[date_str]["impressions"] += impressions
        by_date[date_str]["clicks"] += clicks

    # Convertir a lista y formatear
    for date_str, values in by_date.items():
        avg_ctr = values["ctr_sum"] / values["ctr_count"] if values["ctr_count"] > 0 else 0.0

        processed.append({
            "date_raw": date_str,
            "spend": values["spend"],
            "leads": values["leads"],
            "visits": values["visits"],
            "reach": values["reach"],
            "impressions": values["impressions"],
            "clicks": values["clicks"],
            "ctr": round(avg_ctr, 2)
        })

    # Ordenar por fecha antes de devolver
    processed.sort(key=lambda x: x['date_raw'])
    return processed

# Objetivos de campaña de Meta que corresponden a cada tipo de dashboard.
# Cubre tanto la nomenclatura legacy como la de Outcome-Driven Ad Experiences (ODAX).
MENSAJES_OBJECTIVES = {'MESSAGES', 'OUTCOME_ENGAGEMENT'}
LEADS_OBJECTIVES = {'LEAD_GENERATION', 'OUTCOME_LEADS'}

def classify_objective(objective):
    """Clasifica el objetivo de una campaña de Meta en 'mensajes', 'leads' u 'otros'."""
    if objective in MENSAJES_OBJECTIVES:
        return 'mensajes'
    if objective in LEADS_OBJECTIVES:
        return 'leads'
    return 'otros'

def fetch_meta_campaign_objectives(account_id):
    """Trae {campaign_id: objective} de una cuenta de Meta, paginando."""
    objectives = {}
    url = f"https://graph.facebook.com/v19.0/{account_id}/campaigns"
    params = {'access_token': ACCESS_TOKEN, 'fields': 'objective', 'limit': 500}

    while url:
        try:
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            print(f"Error fetching campaigns for {account_id}: {e}")
            break

        for campaign in data.get('data', []):
            objectives[campaign['id']] = campaign.get('objective', '')

        url = data.get('paging', {}).get('next')
        params = None  # la URL de paginación ya trae sus propios query params

    return objectives

def fetch_meta_range(since_date, until_date):
    """Trae insights diarios de Meta a NIVEL DE CAMPAÑA para todas las cuentas
    configuradas en [since, until], y etiqueta cada fila con su bucket
    ('mensajes' / 'leads' / 'otros') según el objetivo real de la campaña.
    Así el gasto de campañas de Mensajes nunca se mezcla con el de Leads."""
    import json
    all_raw_data = []

    for account_id in AD_ACCOUNT_IDS:
        objectives = fetch_meta_campaign_objectives(account_id)

        url = f"https://graph.facebook.com/v19.0/{account_id}/insights"
        params = {
            'access_token': ACCESS_TOKEN,
            'level': 'campaign',
            'fields': 'campaign_id,spend,actions,unique_inline_link_click_ctr,inline_link_click_ctr,reach,impressions,clicks,date_start',
            'time_increment': 1,
            'time_range': json.dumps({"since": since_date, "until": until_date}),
            'limit': '1000'
        }
        try:
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            res_json = response.json()
            for entry in res_json.get('data', []):
                entry['_bucket'] = classify_objective(objectives.get(entry.get('campaign_id'), ''))
                all_raw_data.append(entry)
        except Exception as e:
            print(f"Error fetching data for {account_id}: {e}")

    return all_raw_data

@app.route('/')
def index():
    return render_template('index.html', client_name=CLIENT_NAME)

@app.route('/api/data')
def get_data():
    since_date = request.args.get('since')
    until_date = request.args.get('until')
    now = get_peru_now()
    today_str = now.strftime('%Y-%m-%d')

    if not since_date or not until_date:
        since_date = today_str
        until_date = today_str

    try:
        raw_data = fetch_meta_range(since_date, until_date)
        mensajes_raw = [d for d in raw_data if d.get('_bucket') == 'mensajes']
        leads_raw = [d for d in raw_data if d.get('_bucket') == 'leads']

        meta_mensajes_by_date = {d['date_raw']: d for d in process_meta_data(mensajes_raw)}
        meta_leads_by_date = {d['date_raw']: d for d in process_meta_data(leads_raw)}

        ghl_opportunities = fetch_ghl_opportunities()
        ghl_daily = process_ghl_data(ghl_opportunities, since_date, until_date)

        processed_data = []
        processed_leads_data = []
        for date_str in date_range_list(since_date, until_date):
            dt_obj = datetime.strptime(date_str, '%Y-%m-%d')
            display_date = dt_obj.strftime('%d %b')

            m = meta_mensajes_by_date.get(date_str, {})
            spend = m.get('spend', 0.0)
            mensajes = ghl_daily.get(date_str, 0)
            processed_data.append({
                "date": display_date,
                "date_raw": date_str,
                "spend": spend,
                "mensajes": mensajes,
                "visits": m.get('visits', 0),
                "reach": m.get('reach', 0),
                "impressions": m.get('impressions', 0),
                "clicks": m.get('clicks', 0),
                "costoMsg": round(spend / mensajes, 2) if mensajes > 0 else 0.0,
                "ctr": m.get('ctr', 0.0)
            })

            l = meta_leads_by_date.get(date_str, {})
            lspend = l.get('spend', 0.0)
            lleads = l.get('leads', 0)
            processed_leads_data.append({
                "date": display_date,
                "date_raw": date_str,
                "spend": lspend,
                "leads": lleads,
                "visits": l.get('visits', 0),
                "reach": l.get('reach', 0),
                "impressions": l.get('impressions', 0),
                "clicks": l.get('clicks', 0),
                "costoLead": round(lspend / lleads, 2) if lleads > 0 else 0.0,
                "ctr": l.get('ctr', 0.0)
            })

        # SIEMPRE Invertir: Lo más reciente primero para la tabla
        display_data = list(reversed(processed_data))
        display_leads_data = list(reversed(processed_leads_data))

        # --- Totales Mensajes (Meta campañas de Mensajes + conteo GHL) ---
        total_spend = sum(d['spend'] for d in processed_data)
        total_mensajes = sum(d['mensajes'] for d in processed_data)
        total_visits = sum(d['visits'] for d in processed_data)
        total_reach = sum(d['reach'] for d in processed_data)
        total_impressions = sum(d['impressions'] for d in processed_data)
        total_clicks = sum(d['clicks'] for d in processed_data)
        avg_costo_msg = round(total_spend / total_mensajes, 2) if total_mensajes > 0 else 0

        presupuesto_total = MONTHLY_BUDGET
        presupuesto_consumido = round(total_spend, 2)
        presupuesto_restante = round(max(0, presupuesto_total - presupuesto_consumido), 2)

        # --- Totales Leads (Meta campañas de Leads, leads nativos de Meta) ---
        total_spend_leads = sum(d['spend'] for d in processed_leads_data)
        total_leads = sum(d['leads'] for d in processed_leads_data)
        total_visits_leads = sum(d['visits'] for d in processed_leads_data)
        total_reach_leads = sum(d['reach'] for d in processed_leads_data)
        total_impressions_leads = sum(d['impressions'] for d in processed_leads_data)
        total_clicks_leads = sum(d['clicks'] for d in processed_leads_data)
        avg_costo_lead = round(total_spend_leads / total_leads, 2) if total_leads > 0 else 0

        # LOGS DE AUDITORÍA SOLICITADOS POR EL USUARIO
        print("\n--- AUDITORÍA DE DATA EN TIEMPO REAL ---")
        print(f"Fecha Hoy (Servidor Lima): {today_str}")
        print(f"Periodo consultado: {since_date} a {until_date}")
        print(f"Cuentas Meta Activas: {len(AD_ACCOUNT_IDS)}")
        print(f"Oportunidades GHL en pipeline: {len(ghl_opportunities)}")
        print(f"[MENSAJES] Gasto: S/. {total_spend:,.2f} | Mensajes: {total_mensajes} | Costo/Msg: S/. {avg_costo_msg:,.2f}")
        print(f"[LEADS] Gasto: S/. {total_spend_leads:,.2f} | Leads: {total_leads} | Costo/Lead: S/. {avg_costo_lead:,.2f}")
        print("----------------------------------------\n")

        return jsonify({
            "status": "success",
            "period": {"since": since_date, "until": until_date},
            "kpis": {
                "gastoTotal": f"S/. {presupuesto_consumido:,.2f}",
                "mensajesTotales": total_mensajes,
                "reachTotal": total_reach,
                "impressionsTotal": total_impressions,
                "clicksTotal": total_clicks,
                "visitsTotal": total_visits,
                "costoPorMsgPromedio": f"S/. {avg_costo_msg:,.2f}",
                "presupuestoConsumido": presupuesto_consumido,
                "presupuestoRestante": presupuesto_restante
            },
            "charts": {
                "line": {
                    "labels": [d["date"] for d in processed_data],
                    "data": [d["costoMsg"] for d in processed_data]
                },
                "mixed": {
                    "labels": [d["date"] for d in processed_data],
                    "spend": [d["spend"] for d in processed_data],
                    "mensajes": [d["mensajes"] for d in processed_data]
                },
                "doughnut": {
                    "labels": ["Consumido", "Restante"],
                    "data": [presupuesto_consumido, presupuesto_restante]
                }
            },
            "dailyMetrics": display_data,
            "leadsKpis": {
                "gastoTotal": f"S/. {total_spend_leads:,.2f}",
                "gastoNumerico": round(total_spend_leads, 2),
                "leadsTotales": total_leads,
                "reachTotal": total_reach_leads,
                "impressionsTotal": total_impressions_leads,
                "clicksTotal": total_clicks_leads,
                "visitsTotal": total_visits_leads,
                "costoPorLeadPromedio": f"S/. {avg_costo_lead:,.2f}"
            },
            "leadsCharts": {
                "line": {
                    "labels": [d["date"] for d in processed_leads_data],
                    "data": [d["costoLead"] for d in processed_leads_data]
                },
                "mixed": {
                    "labels": [d["date"] for d in processed_leads_data],
                    "spend": [d["spend"] for d in processed_leads_data],
                    "leads": [d["leads"] for d in processed_leads_data]
                }
            },
            "leadsDailyMetrics": display_leads_data
        })

    except Exception as e:
        return jsonify({"status": "error", "message": f"Sync Error: {str(e)}"})

@app.route('/api/today')
def get_today():
    now = get_peru_now()
    today_str = now.strftime('%Y-%m-%d')

    try:
        raw_data = fetch_meta_range(today_str, today_str)
        mensajes_raw = [d for d in raw_data if d.get('_bucket') == 'mensajes']
        leads_raw = [d for d in raw_data if d.get('_bucket') == 'leads']

        meta_mensajes_today = process_meta_data(mensajes_raw)
        meta_leads_today = process_meta_data(leads_raw)

        m = meta_mensajes_today[0] if meta_mensajes_today else {"spend": 0.0, "ctr": 0.0}
        l = meta_leads_today[0] if meta_leads_today else {"spend": 0.0, "leads": 0, "ctr": 0.0}

        ghl_opportunities = fetch_ghl_opportunities()
        mensajes = process_ghl_data(ghl_opportunities, today_str, today_str).get(today_str, 0)
        spend = m.get('spend', 0.0)
        lspend = l.get('spend', 0.0)
        lleads = l.get('leads', 0)

        return jsonify({
            "status": "success",
            "data": {
                "date": now.strftime('%d %b'),
                "date_raw": today_str,
                "spend": spend,
                "mensajes": mensajes,
                "costoMsg": round(spend / mensajes, 2) if mensajes > 0 else 0.0,
                "ctr": m.get('ctr', 0.0)
            },
            "leadsData": {
                "date": now.strftime('%d %b'),
                "date_raw": today_str,
                "spend": lspend,
                "leads": lleads,
                "costoLead": round(lspend / lleads, 2) if lleads > 0 else 0.0,
                "ctr": l.get('ctr', 0.0)
            }
        })
    except Exception:
        return jsonify({"status": "error"})

if __name__ == '__main__':
    app.run(debug=True)
