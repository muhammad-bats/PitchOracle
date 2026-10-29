"""
Future-Proof Data Loader, Live Real-Data Sync Engine, and CSV Database Manager
covering Premier League, La Liga, Bundesliga, Serie A, Ligue 1, and UEFA Champions League.

Designed to:
1. Dynamically determine active and historical European seasons based on wall-clock date.
2. Extract, parse, and normalize real completed matches from:
   - football-data.co.uk CSV feeds (E0, SP1, D1, I1, F1)
   - UEFA Champions League match records
3. Persist all records into `backend/data/historical_matches.csv`.
4. Only update the current active season during sync, preserving all prior chronological seasons.
5. Auto-discover and register any newly promoted clubs so standings and predictions never break.
"""

from __future__ import annotations

import hashlib
import io
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests

DATA_DIR = Path(__file__).resolve().parent / "data"
CACHE_DIR = DATA_DIR / "cache"
HISTORICAL_CSV_PATH = DATA_DIR / "historical_matches.csv"

LEAGUES: Dict[str, Dict[str, Any]] = {
    "PL": {
        "code": "PL",
        "name": "Premier League",
        "country": "England",
        "flag": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
        "fd_uk_code": "E0",
        "espn_slug": "eng.1",
        "accent": "#38003c",
        "highlight": "#00ff85",
        "avg_goals": 2.88,
        "home_advantage": 0.24,
        "description": "High-tempo, physical, and transition-heavy top flight with elite tactical depth.",
    },
    "PD": {
        "code": "PD",
        "name": "La Liga",
        "country": "Spain",
        "flag": "🇪🇸",
        "fd_uk_code": "SP1",
        "espn_slug": "esp.1",
        "accent": "#ff4b44",
        "highlight": "#ffbe0b",
        "avg_goals": 2.64,
        "home_advantage": 0.27,
        "description": "Technical possession play, positional discipline, and clinical attacking giants.",
    },
    "BL1": {
        "code": "BL1",
        "name": "Bundesliga",
        "country": "Germany",
        "flag": "🇩🇪",
        "fd_uk_code": "D1",
        "espn_slug": "ger.1",
        "accent": "#d20515",
        "highlight": "#ff5964",
        "avg_goals": 3.14,
        "home_advantage": 0.25,
        "description": "Europe's highest-scoring top league driven by verticality and relentless Gegenpressing.",
    },
    "SA": {
        "code": "SA",
        "name": "Serie A",
        "country": "Italy",
        "flag": "🇮🇹",
        "fd_uk_code": "I1",
        "espn_slug": "ita.1",
        "accent": "#024494",
        "highlight": "#00d4ff",
        "avg_goals": 2.68,
        "home_advantage": 0.23,
        "description": "Tactical chess matches blending fluid back-three build-up with compact defensive blocks.",
    },
    "FL1": {
        "code": "FL1",
        "name": "Ligue 1",
        "country": "France",
        "flag": "🇫🇷",
        "fd_uk_code": "F1",
        "espn_slug": "fra.1",
        "accent": "#091c3e",
        "highlight": "#dae025",
        "avg_goals": 2.72,
        "home_advantage": 0.25,
        "description": "Explosive athleticism, dynamic wing play, and world-class youth talent.",
    },
    "CL": {
        "code": "CL",
        "name": "UEFA Champions League",
        "country": "Europe",
        "flag": "🇪🇺",
        "fd_uk_code": None,
        "espn_slug": "uefa.champions",
        "accent": "#0a1128",
        "highlight": "#3b82f6",
        "avg_goals": 2.96,
        "home_advantage": 0.28,
        "description": "Continental elite competition pitting Europe's domestic champions and powerhouses head-to-head.",
    },
}

# Tuple schema:
# (name, short_name, tla, league, country, stadium, primary_color, secondary_color, base_elo, attack, defense, possession, press, ucl_participant)
CLUB_DEFINITIONS: List[Tuple[str, str, str, str, str, str, str, str, float, float, float, float, float, bool]] = [
    # Premier League
    ("Manchester City", "Man City", "MCI", "PL", "England", "Etihad Stadium", "#6CABDD", "#1C2C5B", 1985, 93, 89, 0.66, 0.86, True),
    ("Arsenal", "Arsenal", "ARS", "PL", "England", "Emirates Stadium", "#EF0107", "#FFFFFF", 1965, 90, 92, 0.61, 0.88, True),
    ("Liverpool", "Liverpool", "LIV", "PL", "England", "Anfield", "#C8102E", "#00B2A9", 1960, 92, 88, 0.60, 0.90, True),
    ("Chelsea", "Chelsea", "CHE", "PL", "England", "Stamford Bridge", "#034694", "#DBA111", 1855, 85, 81, 0.58, 0.80, False),
    ("Aston Villa", "Aston Villa", "AVL", "PL", "England", "Villa Park", "#95BFE5", "#670E36", 1850, 83, 82, 0.53, 0.78, True),
    ("Newcastle United", "Newcastle", "NEW", "PL", "England", "St James' Park", "#241F20", "#FFFFFF", 1845, 84, 81, 0.52, 0.85, False),
    ("Tottenham Hotspur", "Tottenham", "TOT", "PL", "England", "Tottenham Hotspur Stadium", "#132257", "#FFFFFF", 1840, 86, 77, 0.59, 0.87, False),
    ("Manchester United", "Man United", "MUN", "PL", "England", "Old Trafford", "#DA291C", "#FBE122", 1815, 80, 79, 0.52, 0.74, False),
    ("Brighton & Hove Albion", "Brighton", "BHA", "PL", "England", "Amex Stadium", "#0057B8", "#FFCD00", 1805, 81, 77, 0.58, 0.82, False),
    ("West Ham United", "West Ham", "WHU", "PL", "England", "London Stadium", "#7A263A", "#1BB1E7", 1770, 77, 75, 0.45, 0.66, False),
    ("Crystal Palace", "Crystal Palace", "CRY", "PL", "England", "Selhurst Park", "#1B458F", "#C4122E", 1765, 76, 77, 0.46, 0.73, False),
    ("Fulham", "Fulham", "FUL", "PL", "England", "Craven Cottage", "#334155", "#CC0000", 1760, 76, 76, 0.50, 0.72, False),
    ("Bournemouth", "Bournemouth", "BOU", "PL", "England", "Vitality Stadium", "#DA291C", "#000000", 1758, 77, 75, 0.47, 0.83, False),
    ("Brentford", "Brentford", "BRE", "PL", "England", "Gtech Community Stadium", "#E30613", "#FFFFFF", 1752, 77, 74, 0.46, 0.76, False),
    ("Everton", "Everton", "EVE", "PL", "England", "Goodison Park", "#003399", "#FFFFFF", 1735, 71, 77, 0.42, 0.70, False),
    ("Nottingham Forest", "Nott'm Forest", "NFO", "PL", "England", "City Ground", "#DD0000", "#FFFFFF", 1745, 75, 76, 0.43, 0.71, False),
    ("Wolverhampton Wanderers", "Wolves", "WOL", "PL", "England", "Molineux Stadium", "#D97706", "#231F20", 1730, 73, 73, 0.47, 0.71, False),
    ("Leicester City", "Leicester", "LEI", "PL", "England", "King Power Stadium", "#003090", "#FDBE11", 1705, 72, 70, 0.49, 0.69, False),
    ("Ipswich Town", "Ipswich", "IPS", "PL", "England", "Portman Road", "#3A64A3", "#FFFFFF", 1680, 70, 68, 0.45, 0.72, False),
    ("Southampton", "Southampton", "SOU", "PL", "England", "St Mary's Stadium", "#D71920", "#FFFFFF", 1675, 69, 67, 0.53, 0.70, False),
    ("Coventry City", "Coventry", "COV", "PL", "England", "Coventry Building Society Arena", "#00B6F1", "#0B2240", 1720, 71, 72, 0.45, 0.72, False),
    ("Hull City", "Hull", "HUL", "PL", "England", "MKM Stadium", "#F5A800", "#000000", 1725, 72, 73, 0.46, 0.73, False),
    ("Leeds United", "Leeds", "LEE", "PL", "England", "Elland Road", "#1E3A8A", "#FFCD00", 1785, 78, 77, 0.54, 0.82, False),
    ("Sunderland", "Sunderland", "SUN", "PL", "England", "Stadium of Light", "#EB172B", "#000000", 1715, 70, 71, 0.44, 0.70, False),
    ("Sheffield United", "Sheffield Utd", "SHU", "PL", "England", "Bramall Lane", "#EE2737", "#000000", 1680, 69, 68, 0.42, 0.69, False),
    ("Burnley", "Burnley", "BUR", "PL", "England", "Turf Moor", "#6C1D45", "#99D6EA", 1710, 71, 72, 0.46, 0.74, False),
    ("Luton Town", "Luton", "LUT", "PL", "England", "Kenilworth Road", "#F78F1E", "#002D62", 1685, 70, 68, 0.43, 0.72, False),

    # La Liga
    ("Real Madrid", "Real Madrid", "RMA", "PD", "Spain", "Santiago Bernabéu", "#00529F", "#FEBE10", 1990, 94, 90, 0.61, 0.83, True),
    ("Barcelona", "Barcelona", "BAR", "PD", "Spain", "Estadi Olímpic / Camp Nou", "#A50044", "#004D98", 1955, 93, 86, 0.65, 0.88, True),
    ("Atlético Madrid", "Atlético", "ATM", "PD", "Spain", "Riyadh Air Metropolitano", "#CB3524", "#272E61", 1895, 86, 89, 0.51, 0.81, True),
    ("Athletic Club", "Athletic", "ATH", "PD", "Spain", "San Mamés", "#EE2523", "#FFFFFF", 1835, 82, 83, 0.51, 0.85, False),
    ("Real Sociedad", "Real Sociedad", "RSO", "PD", "Spain", "Reale Arena", "#0067B1", "#FFFFFF", 1820, 79, 83, 0.56, 0.86, False),
    ("Girona", "Girona", "GIR", "PD", "Spain", "Estadi Montilivi", "#CD2534", "#FFFFFF", 1810, 83, 77, 0.57, 0.79, True),
    ("Villarreal", "Villarreal", "VIL", "PD", "Spain", "Estadio de la Cerámica", "#005187", "#FFE667", 1805, 82, 76, 0.53, 0.75, False),
    ("Real Betis", "Real Betis", "BET", "PD", "Spain", "Benito Villamarín", "#0BB363", "#FFFFFF", 1790, 78, 78, 0.53, 0.74, False),
    ("Sevilla", "Sevilla", "SEV", "PD", "Spain", "Ramón Sánchez-Pizjuán", "#D4021D", "#FFFFFF", 1755, 75, 75, 0.51, 0.73, False),
    ("Valencia", "Valencia", "VAL", "PD", "Spain", "Mestalla", "#EA580C", "#000000", 1745, 73, 75, 0.46, 0.72, False),
    ("Celta Vigo", "Celta Vigo", "CEL", "PD", "Spain", "Balaídos", "#0284C7", "#D11241", 1740, 76, 72, 0.49, 0.71, False),
    ("Osasuna", "Osasuna", "OSA", "PD", "Spain", "El Sadar", "#0A346F", "#D91A21", 1738, 73, 74, 0.46, 0.74, False),
    ("Mallorca", "Mallorca", "MLL", "PD", "Spain", "Son Moix", "#E20613", "#000000", 1730, 70, 76, 0.43, 0.68, False),
    ("Rayo Vallecano", "Rayo", "RAY", "PD", "Spain", "Vallecas", "#E53027", "#FFFFFF", 1725, 72, 73, 0.48, 0.78, False),
    ("Getafe", "Getafe", "GET", "PD", "Spain", "Coliseum", "#005999", "#FFFFFF", 1720, 69, 76, 0.41, 0.69, False),
    ("Alavés", "Alavés", "ALA", "PD", "Spain", "Mendizorrotza", "#0057A3", "#FFFFFF", 1712, 70, 73, 0.43, 0.70, False),
    ("Las Palmas", "Las Palmas", "LPA", "PD", "Spain", "Gran Canaria", "#00529F", "#FEDD00", 1700, 71, 71, 0.56, 0.72, False),
    ("Leganés", "Leganés", "LEG", "PD", "Spain", "Butarque", "#0055A4", "#FFFFFF", 1685, 68, 70, 0.42, 0.67, False),
    ("Espanyol", "Espanyol", "ESP", "PD", "Spain", "RCDE Stadium", "#007FC8", "#FFFFFF", 1682, 69, 69, 0.44, 0.68, False),
    ("Real Valladolid", "Valladolid", "VLL", "PD", "Spain", "José Zorrilla", "#5A2A82", "#FFFFFF", 1670, 67, 68, 0.43, 0.67, False),
    ("Elche CF", "Elche", "ELC", "PD", "Spain", "Martínez Valero", "#006837", "#FFFFFF", 1690, 69, 70, 0.44, 0.69, False),
    ("Deportivo La Coruña", "La Coruña", "DEP", "PD", "Spain", "Riazor", "#005CAB", "#FFFFFF", 1715, 72, 73, 0.48, 0.73, False),
    ("Levante UD", "Levante", "LEV", "PD", "Spain", "Ciutat de València", "#003366", "#BA0C2F", 1705, 71, 71, 0.46, 0.71, False),
    ("Málaga CF", "Málaga", "MCF", "PD", "Spain", "La Rosaleda", "#008CD2", "#FFFFFF", 1700, 70, 71, 0.45, 0.70, False),
    ("Racing Santander", "Santander", "RAC", "PD", "Spain", "El Sardinero", "#008037", "#000000", 1695, 70, 70, 0.44, 0.69, False),
    ("Cádiz CF", "Cádiz", "CAD", "PD", "Spain", "Nuevo Mirandilla", "#FFDF00", "#002B49", 1680, 68, 70, 0.41, 0.68, False),
    ("Granada CF", "Granada", "GRA", "PD", "Spain", "Nuevo Los Cármenes", "#A6192E", "#FFFFFF", 1675, 68, 69, 0.42, 0.68, False),
    ("UD Almería", "Almería", "ALM", "PD", "Spain", "Power Horse Stadium", "#ED1C24", "#FFFFFF", 1670, 69, 67, 0.43, 0.67, False),

    # Bundesliga
    ("Bayern Munich", "Bayern", "BAY", "BL1", "Germany", "Allianz Arena", "#DC052D", "#0066B2", 1965, 95, 86, 0.65, 0.89, True),
    ("Bayer Leverkusen", "Leverkusen", "B04", "BL1", "Germany", "BayArena", "#E32221", "#000000", 1935, 90, 87, 0.61, 0.87, True),
    ("Borussia Dortmund", "Dortmund", "BVB", "BL1", "Germany", "Signal Iduna Park", "#D97706", "#000000", 1885, 88, 82, 0.58, 0.84, True),
    ("RB Leipzig", "RB Leipzig", "RBL", "BL1", "Germany", "Red Bull Arena", "#DD0741", "#001F47", 1875, 86, 83, 0.55, 0.88, True),
    ("VfB Stuttgart", "Stuttgart", "VFB", "BL1", "Germany", "MHPArena", "#E32219", "#FFFFFF", 1845, 85, 80, 0.58, 0.83, True),
    ("Eintracht Frankfurt", "Frankfurt", "SGE", "BL1", "Germany", "Deutsche Bank Park", "#E1000F", "#000000", 1815, 82, 78, 0.51, 0.79, False),
    ("SC Freiburg", "Freiburg", "SCF", "BL1", "Germany", "Europa-Park Stadion", "#E4002B", "#000000", 1785, 77, 78, 0.49, 0.76, False),
    ("TSG Hoffenheim", "Hoffenheim", "TSG", "BL1", "Germany", "PreZero Arena", "#005CA9", "#FFFFFF", 1750, 78, 72, 0.50, 0.74, False),
    ("Werder Bremen", "Bremen", "SVW", "BL1", "Germany", "Weserstadion", "#1D9053", "#FFFFFF", 1745, 76, 73, 0.48, 0.73, False),
    ("VfL Wolfsburg", "Wolfsburg", "WOB", "BL1", "Germany", "Volkswagen Arena", "#16A34A", "#FFFFFF", 1742, 76, 74, 0.48, 0.75, False),
    ("Borussia Mönchengladbach", "Gladbach", "BMG", "BL1", "Germany", "Borussia-Park", "#1E293B", "#1E90FF", 1735, 77, 71, 0.49, 0.72, False),
    ("1. FC Heidenheim", "Heidenheim", "HDH", "BL1", "Germany", "Voith-Arena", "#E2001A", "#003D7C", 1730, 74, 73, 0.43, 0.76, False),
    ("FC Augsburg", "Augsburg", "FCA", "BL1", "Germany", "WWK Arena", "#BA3733", "#467148", 1720, 73, 72, 0.44, 0.74, False),
    ("1. FC Union Berlin", "Union Berlin", "FCU", "BL1", "Germany", "Alte Försterei", "#EB1923", "#F4A900", 1725, 71, 76, 0.42, 0.75, False),
    ("1. FSV Mainz 05", "Mainz 05", "M05", "BL1", "Germany", "Mewa Arena", "#C3141E", "#FFFFFF", 1732, 74, 74, 0.46, 0.79, False),
    ("VfL Bochum", "Bochum", "BOC", "BL1", "Germany", "Vonovia Ruhrstadion", "#005CA9", "#FFFFFF", 1685, 70, 68, 0.44, 0.73, False),
    ("FC St. Pauli", "St. Pauli", "STP", "BL1", "Germany", "Millerntor-Stadion", "#623B2A", "#FFFFFF", 1680, 69, 70, 0.47, 0.74, False),
    ("Holstein Kiel", "Holstein Kiel", "KSV", "BL1", "Germany", "Holstein-Stadion", "#004B93", "#E30613", 1665, 69, 66, 0.44, 0.71, False),
    ("SV Elversberg", "Elversberg", "SVE", "BL1", "Germany", "Ursapharm-Arena", "#1E293B", "#FFFFFF", 1690, 71, 70, 0.45, 0.72, False),
    ("1. FC Köln", "Köln", "KOE", "BL1", "Germany", "RheinEnergieStadion", "#ED1C24", "#FFFFFF", 1735, 74, 73, 0.48, 0.76, False),
    ("Hamburger SV", "Hamburg", "HSV", "BL1", "Germany", "Volksparkstadion", "#0055A5", "#000000", 1740, 75, 73, 0.50, 0.76, False),
    ("SC Paderborn 07", "Paderborn", "SCP", "BL1", "Germany", "Home Deluxe Arena", "#005CA9", "#000000", 1695, 71, 70, 0.46, 0.72, False),
    ("FC Schalke 04", "Schalke", "S04", "BL1", "Germany", "Veltins-Arena", "#004D9D", "#FFFFFF", 1730, 74, 72, 0.49, 0.75, False),
    ("SV Darmstadt 98", "Darmstadt", "D98", "BL1", "Germany", "Merck-Stadion", "#004E9E", "#FFFFFF", 1665, 68, 66, 0.42, 0.70, False),

    # Serie A
    ("Inter Milan", "Inter", "INT", "SA", "Italy", "San Siro", "#010E80", "#000000", 1965, 91, 91, 0.59, 0.84, True),
    ("AC Milan", "AC Milan", "MIL", "SA", "Italy", "San Siro", "#FB090B", "#000000", 1875, 86, 82, 0.56, 0.81, True),
    ("Juventus", "Juventus", "JUV", "SA", "Italy", "Allianz Stadium", "#1E293B", "#64748B", 1885, 83, 88, 0.55, 0.79, True),
    ("Atalanta", "Atalanta", "ATA", "SA", "Italy", "Gewiss Stadium", "#1E71B8", "#000000", 1890, 89, 83, 0.55, 0.89, True),
    ("Napoli", "Napoli", "NAP", "SA", "Italy", "Stadio Diego Armando Maradona", "#0284C7", "#003C82", 1880, 86, 85, 0.58, 0.83, False),
    ("AS Roma", "Roma", "ROM", "SA", "Italy", "Stadio Olimpico", "#8E1F2F", "#F0BC42", 1825, 81, 80, 0.54, 0.77, False),
    ("Lazio", "Lazio", "LAZ", "SA", "Italy", "Stadio Olimpico", "#0284C7", "#15366F", 1820, 81, 79, 0.53, 0.78, False),
    ("Fiorentina", "Fiorentina", "FIO", "SA", "Italy", "Stadio Artemio Franchi", "#482E92", "#FFFFFF", 1810, 80, 79, 0.56, 0.80, False),
    ("Bologna", "Bologna", "BOL", "SA", "Italy", "Stadio Renato Dall'Ara", "#1A2F48", "#A21C26", 1805, 78, 81, 0.56, 0.81, True),
    ("Torino", "Torino", "TOR", "SA", "Italy", "Stadio Olimpico Grande Torino", "#8A1E03", "#FFFFFF", 1765, 73, 79, 0.49, 0.77, False),
    ("Udinese", "Udinese", "UDI", "SA", "Italy", "Bluenergy Stadium", "#334155", "#FFFFFF", 1735, 73, 74, 0.44, 0.71, False),
    ("Genoa", "Genoa", "GEN", "SA", "Italy", "Stadio Luigi Ferraris", "#A50021", "#002B5C", 1730, 72, 75, 0.45, 0.72, False),
    ("Monza", "Monza", "MON", "SA", "Italy", "U-Power Stadium", "#E30613", "#FFFFFF", 1720, 72, 73, 0.51, 0.71, False),
    ("Hellas Verona", "Verona", "VER", "SA", "Italy", "Stadio Marcantonio Bentegodi", "#002F6C", "#FFCD00", 1710, 71, 72, 0.44, 0.73, False),
    ("Lecce", "Lecce", "LEC", "SA", "Italy", "Stadio Via del Mare", "#E30613", "#D97706", 1705, 69, 72, 0.44, 0.72, False),
    ("Cagliari", "Cagliari", "CAG", "SA", "Italy", "Unipol Domus", "#A50021", "#002350", 1700, 71, 70, 0.44, 0.70, False),
    ("Empoli", "Empoli", "EMP", "SA", "Italy", "Stadio Carlo Castellani", "#00579C", "#FFFFFF", 1698, 68, 72, 0.43, 0.71, False),
    ("Parma", "Parma", "PAR", "SA", "Italy", "Stadio Ennio Tardini", "#003399", "#FFCC00", 1695, 72, 69, 0.45, 0.72, False),
    ("Como", "Como", "COM", "SA", "Italy", "Stadio Giuseppe Sinigaglia", "#0054A6", "#FFFFFF", 1690, 71, 69, 0.51, 0.73, False),
    ("Venezia", "Venezia", "VEN", "SA", "Italy", "Stadio Pier Luigi Penzo", "#EA580C", "#006847", 1670, 68, 67, 0.44, 0.68, False),
    ("Frosinone", "Frosinone", "FRO", "SA", "Italy", "Stadio Benito Stirpe", "#FED100", "#005CA9", 1685, 70, 69, 0.44, 0.70, False),
    ("Sassuolo", "Sassuolo", "SAS", "SA", "Italy", "Mapei Stadium", "#00A651", "#000000", 1720, 74, 71, 0.48, 0.73, False),
    ("Salernitana", "Salernitana", "SAL", "SA", "Italy", "Stadio Arechi", "#8A1E03", "#FFFFFF", 1660, 67, 66, 0.41, 0.67, False),

    # Ligue 1
    ("Paris Saint-Germain", "PSG", "PSG", "FL1", "France", "Parc des Princes", "#004170", "#DA291C", 1945, 92, 86, 0.66, 0.87, True),
    ("AS Monaco", "Monaco", "ASM", "FL1", "France", "Stade Louis II", "#E51B24", "#FFFFFF", 1845, 85, 80, 0.55, 0.84, True),
    ("Lille OSC", "Lille", "LIL", "FL1", "France", "Stade Pierre-Mauroy", "#E01E13", "#1A2141", 1835, 81, 83, 0.56, 0.81, True),
    ("Olympique Marseille", "Marseille", "OM", "FL1", "France", "Stade Vélodrome", "#0284C7", "#FFFFFF", 1830, 84, 79, 0.57, 0.82, False),
    ("Olympique Lyonnais", "Lyon", "OL", "FL1", "France", "Groupama Stadium", "#1226AA", "#DA001A", 1805, 82, 77, 0.55, 0.77, False),
    ("OGC Nice", "Nice", "NIC", "FL1", "France", "Allianz Riviera", "#D61016", "#000000", 1800, 78, 82, 0.53, 0.79, False),
    ("RC Lens", "RC Lens", "RCL", "FL1", "France", "Stade Bollaert-Delelis", "#EC1C24", "#D97706", 1795, 78, 80, 0.52, 0.82, False),
    ("Stade Brestois", "Brest", "SB29", "FL1", "France", "Stade Francis-Le Blé", "#E30613", "#FFFFFF", 1785, 78, 79, 0.49, 0.78, True),
    ("Stade Rennais", "Rennes", "SRFC", "FL1", "France", "Roazhon Park", "#E41B17", "#000000", 1780, 79, 76, 0.54, 0.77, False),
    ("Stade de Reims", "Reims", "SDR", "FL1", "France", "Stade Auguste-Delaune", "#D71920", "#FFFFFF", 1745, 74, 74, 0.48, 0.75, False),
    ("Toulouse FC", "Toulouse", "TFC", "FL1", "France", "Stadium de Toulouse", "#512B81", "#FFFFFF", 1735, 73, 73, 0.47, 0.73, False),
    ("RC Strasbourg", "Strasbourg", "RCS", "FL1", "France", "Stade de la Meinau", "#0093D0", "#FFFFFF", 1725, 74, 72, 0.48, 0.75, False),
    ("Montpellier HSC", "Montpellier", "MHSC", "FL1", "France", "Stade de la Mosson", "#002B5C", "#F37021", 1715, 73, 70, 0.46, 0.71, False),
    ("FC Nantes", "Nantes", "FCN", "FL1", "France", "Stade de la Beaujoire", "#009A44", "#D97706", 1705, 70, 71, 0.44, 0.69, False),
    ("Le Havre AC", "Le Havre", "HAC", "FL1", "France", "Stade Océane", "#00205B", "#0284C7", 1690, 68, 71, 0.43, 0.70, False),
    ("AJ Auxerre", "Auxerre", "AJA", "FL1", "France", "Stade de l'Abbé-Deschamps", "#0055A4", "#FFFFFF", 1685, 70, 69, 0.45, 0.70, False),
    ("Angers SCO", "Angers", "SCO", "FL1", "France", "Stade Raymond Kopa", "#334155", "#FFFFFF", 1670, 67, 68, 0.43, 0.68, False),
    ("AS Saint-Étienne", "Saint-Étienne", "ASSE", "FL1", "France", "Stade Geoffroy-Guichard", "#008A3C", "#FFFFFF", 1680, 69, 69, 0.45, 0.70, False),
    ("Le Mans FC", "Le Mans", "LEM", "FL1", "France", "Stade Marie-Marvingt", "#D52B1E", "#FFCC00", 1680, 69, 69, 0.44, 0.70, False),
    ("FC Lorient", "Lorient", "FCL", "FL1", "France", "Stade du Moustoir", "#FF6600", "#000000", 1710, 72, 71, 0.46, 0.72, False),
    ("Paris FC", "Paris FC", "PFC", "FL1", "France", "Stade Charléty", "#0A2158", "#0284C7", 1715, 73, 72, 0.48, 0.74, False),
    ("ES Troyes AC", "Troyes", "EST", "FL1", "France", "Stade de l'Aube", "#0055A5", "#FFFFFF", 1685, 69, 69, 0.43, 0.70, False),
    ("Clermont Foot", "Clermont", "CF63", "FL1", "France", "Stade Gabriel-Montpied", "#A81D33", "#002B49", 1670, 67, 68, 0.42, 0.68, False),
    ("FC Metz", "Metz", "FCM", "FL1", "France", "Stade Saint-Symphorien", "#800020", "#FFFFFF", 1675, 68, 69, 0.43, 0.69, False),

    # UEFA Champions League European Giants
    ("Sporting CP", "Sporting CP", "SCP", "CL", "Portugal", "Estádio José Alvalade", "#008057", "#FFFFFF", 1865, 86, 82, 0.58, 0.84, True),
    ("Benfica", "Benfica", "SLB", "CL", "Portugal", "Estádio da Luz", "#E83030", "#FFFFFF", 1850, 84, 81, 0.57, 0.82, True),
    ("FC Porto", "FC Porto", "FCP", "CL", "Portugal", "Estádio do Dragão", "#00428C", "#FFFFFF", 1835, 82, 82, 0.55, 0.83, True),
    ("PSV Eindhoven", "PSV", "PSV", "CL", "Netherlands", "Philips Stadion", "#ED1C24", "#FFFFFF", 1830, 85, 79, 0.59, 0.83, True),
    ("Feyenoord", "Feyenoord", "FEY", "CL", "Netherlands", "De Kuip", "#EE1C25", "#FFFFFF", 1800, 81, 78, 0.56, 0.82, True),
    ("Club Brugge", "Club Brugge", "BRU", "CL", "Belgium", "Jan Breydel Stadium", "#0072CE", "#000000", 1775, 78, 77, 0.52, 0.77, True),
    ("Celtic", "Celtic", "CELT", "CL", "Scotland", "Celtic Park", "#018749", "#FFFFFF", 1770, 80, 75, 0.58, 0.82, True),
    ("Galatasaray", "Galatasaray", "GAL", "CL", "Turkey", "RAMS Park", "#A90432", "#D97706", 1775, 81, 75, 0.54, 0.79, True),
    ("Shakhtar Donetsk", "Shakhtar", "SHK", "CL", "Ukraine", "Arena AufSchalke", "#EA580C", "#000000", 1745, 76, 74, 0.52, 0.74, True),
    ("RB Salzburg", "RB Salzburg", "RBS", "CL", "Austria", "Red Bull Arena Salzburg", "#E4002B", "#FFFFFF", 1740, 77, 73, 0.51, 0.84, True),
]

# Map CSV and live API club name aliases to canonical club names
CSV_NAME_MAP: Dict[str, str] = {
    # Premier League
    "Man City": "Manchester City",
    "Manchester City": "Manchester City",
    "Man United": "Manchester United",
    "Manchester Utd": "Manchester United",
    "Newcastle": "Newcastle United",
    "Tottenham": "Tottenham Hotspur",
    "Spurs": "Tottenham Hotspur",
    "Brighton": "Brighton & Hove Albion",
    "West Ham": "West Ham United",
    "Nott'm Forest": "Nottingham Forest",
    "Nottingham": "Nottingham Forest",
    "Wolves": "Wolverhampton Wanderers",
    "Leicester": "Leicester City",
    "Ipswich": "Ipswich Town",
    "Coventry": "Coventry City",
    "Hull": "Hull City",
    "Leeds": "Leeds United",
    "Sunderland": "Sunderland",
    "Southampton": "Southampton",
    "Sheffield United": "Sheffield United",
    "Sheffield Utd": "Sheffield United",
    "Burnley": "Burnley",
    "Luton": "Luton Town",
    # La Liga
    "Ath Madrid": "Atlético Madrid",
    "Atletico Madrid": "Atlético Madrid",
    "Ath Bilbao": "Athletic Club",
    "Athletic Bilbao": "Athletic Club",
    "Sociedad": "Real Sociedad",
    "Betis": "Real Betis",
    "Celta": "Celta Vigo",
    "Vallecano": "Rayo Vallecano",
    "Alaves": "Alavés",
    "Deportivo Alavés": "Alavés",
    "Leganes": "Leganés",
    "Valladolid": "Real Valladolid",
    "Elche": "Elche CF",
    "Espanol": "Espanyol",
    "La Coruna": "Deportivo La Coruña",
    "Levante": "Levante UD",
    "Malaga": "Málaga CF",
    "Santander": "Racing Santander",
    "Cadiz": "Cádiz CF",
    "Granada": "Granada CF",
    "Almeria": "UD Almería",
    # Bundesliga
    "Bayern Munich": "Bayern Munich",
    "Bayern München": "Bayern Munich",
    "Leverkusen": "Bayer Leverkusen",
    "Bayer 04 Leverkusen": "Bayer Leverkusen",
    "Dortmund": "Borussia Dortmund",
    "RB Leipzig": "RB Leipzig",
    "Stuttgart": "VfB Stuttgart",
    "Ein Frankfurt": "Eintracht Frankfurt",
    "Freiburg": "SC Freiburg",
    "Hoffenheim": "TSG Hoffenheim",
    "Werder Bremen": "Werder Bremen",
    "Wolfsburg": "VfL Wolfsburg",
    "M'gladbach": "Borussia Mönchengladbach",
    "Borussia Monchengladbach": "Borussia Mönchengladbach",
    "Heidenheim": "1. FC Heidenheim",
    "Augsburg": "FC Augsburg",
    "Union Berlin": "1. FC Union Berlin",
    "Mainz": "1. FSV Mainz 05",
    "Bochum": "VfL Bochum",
    "St Pauli": "FC St. Pauli",
    "Holstein Kiel": "Holstein Kiel",
    "Elversberg": "SV Elversberg",
    "FC Koln": "1. FC Köln",
    "Koln": "1. FC Köln",
    "Hamburg": "Hamburger SV",
    "Paderborn": "SC Paderborn 07",
    "Schalke 04": "FC Schalke 04",
    "Schalke": "FC Schalke 04",
    "Darmstadt": "SV Darmstadt 98",
    # Serie A
    "Inter": "Inter Milan",
    "Internazionale": "Inter Milan",
    "Milan": "AC Milan",
    "Roma": "AS Roma",
    "Verona": "Hellas Verona",
    "Frosinone": "Frosinone",
    "Sassuolo": "Sassuolo",
    "Salernitana": "Salernitana",
    # Ligue 1
    "Paris SG": "Paris Saint-Germain",
    "Paris Saint Germain": "Paris Saint-Germain",
    "Monaco": "AS Monaco",
    "Lille": "Lille OSC",
    "Marseille": "Olympique Marseille",
    "Lyon": "Olympique Lyonnais",
    "Nice": "OGC Nice",
    "Lens": "RC Lens",
    "Brest": "Stade Brestois",
    "Stade Brestois 29": "Stade Brestois",
    "Rennes": "Stade Rennais",
    "Reims": "Stade de Reims",
    "Toulouse": "Toulouse FC",
    "Strasbourg": "RC Strasbourg",
    "Montpellier": "Montpellier HSC",
    "Nantes": "FC Nantes",
    "Le Havre": "Le Havre AC",
    "Auxerre": "AJ Auxerre",
    "Angers": "Angers SCO",
    "St Etienne": "AS Saint-Étienne",
    "Saint-Etienne": "AS Saint-Étienne",
    "Le Mans": "Le Mans FC",
    "Lorient": "FC Lorient",
    "Paris FC": "Paris FC",
    "Troyes": "ES Troyes AC",
    "Clermont": "Clermont Foot",
    "Metz": "FC Metz",
}

_DYNAMIC_CLUBS_REGISTRY: Dict[str, Dict[str, Any]] = {}


def get_current_season_label(now: Optional[datetime] = None) -> str:
    """Return the canonical season string (e.g. '2026/27') for any date."""
    if now is None:
        now = datetime.now()
    start_year = now.year if now.month >= 7 else now.year - 1
    end_short = str(start_year + 1)[-2:]
    return f"{start_year}/{end_short}"


def get_current_season_code(now: Optional[datetime] = None) -> str:
    """Return the 4-digit season code (e.g. '2627') for football-data.co.uk URLs."""
    if now is None:
        now = datetime.now()
    start_year = now.year if now.month >= 7 else now.year - 1
    return f"{str(start_year)[-2:]}{str(start_year + 1)[-2:]}"


def register_dynamic_club(name: str, league_code: str = "PL") -> Dict[str, Any]:
    """Auto-register a newly promoted or previously unknown club so future seasons never fail."""
    if name in _DYNAMIC_CLUBS_REGISTRY:
        return _DYNAMIC_CLUBS_REGISTRY[name]

    palette = ["#1E3A8A", "#991B1B", "#065F46", "#3730A3", "#9A3412", "#1E293B", "#0369A1"]
    h_idx = int(hashlib.md5(name.encode("utf-8")).hexdigest()[:6], 16)
    color = palette[h_idx % len(palette)]
    words = [w for w in name.replace(".", "").split() if w]
    tla = (words[0][:3] if len(words) == 1 else "".join(w[0] for w in words[:3])).upper()
    if len(tla) < 3:
        tla = (name[:3]).upper()

    meta = {
        "name": name,
        "short_name": name[:14],
        "tla": tla,
        "league": league_code,
        "country": LEAGUES.get(league_code, LEAGUES["PL"])["country"],
        "stadium": f"{name} Stadium",
        "primary_color": color,
        "secondary_color": "#64748B",
        "base_elo": 1695.0,
        "attack": 71.0,
        "defense": 71.0,
        "possession_style": 0.46,
        "pressing_intensity": 0.71,
        "ucl_participant": league_code == "CL",
    }
    _DYNAMIC_CLUBS_REGISTRY[name] = meta
    return meta


def get_clubs_dict() -> Dict[str, Dict[str, Any]]:
    """Return dictionary of all clubs indexed by canonical name."""
    clubs: Dict[str, Dict[str, Any]] = {}
    for (
        name,
        short_name,
        tla,
        league,
        country,
        stadium,
        primary_color,
        secondary_color,
        base_elo,
        attack,
        defense,
        possession,
        press,
        ucl,
    ) in CLUB_DEFINITIONS:
        clubs[name] = {
            "name": name,
            "short_name": short_name,
            "tla": tla,
            "league": league,
            "country": country,
            "stadium": stadium,
            "primary_color": primary_color,
            "secondary_color": secondary_color,
            "base_elo": float(base_elo),
            "attack": float(attack),
            "defense": float(defense),
            "possession_style": float(possession),
            "pressing_intensity": float(press),
            "ucl_participant": bool(ucl),
        }
    clubs.update(_DYNAMIC_CLUBS_REGISTRY)
    return clubs


def get_league_clubs(league_code: str, season: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Return all active clubs participating in the specified competition for the specified season.
    Dynamically extracts the clubs from matches played in that season so promoted/relegated clubs
    accurately reflect real-world divisions.
    """
    clubs = get_clubs_dict()
    if season is None:
        season = get_current_season_label()

    if league_code == "CL":
        res = [c for c in clubs.values() if c["ucl_participant"]]
        return sorted(res, key=lambda x: -x["base_elo"])

    # If historical matches CSV exists, extract actual clubs that played in this league this season
    if HISTORICAL_CSV_PATH.exists():
        try:
            df = pd.read_csv(HISTORICAL_CSV_PATH)
            sub = df[(df["league"] == league_code) & (df["season"] == season)]
            if not sub.empty:
                active_names = set(sub["home_team"].unique()) | set(sub["away_team"].unique())
                active_clubs = []
                for name in active_names:
                    if name in clubs:
                        active_clubs.append(clubs[name])
                    else:
                        active_clubs.append(register_dynamic_club(name, league_code))
                return sorted(active_clubs, key=lambda x: -x["base_elo"])
        except Exception:
            pass

    # Fallback to static definitions matching this league
    res = [c for c in clubs.values() if c["league"] == league_code]
    return sorted(res, key=lambda x: -x["base_elo"])


def generate_multi_season_dataset(force: bool = False) -> pd.DataFrame:
    """
    Load or build the multi-season historical CSV database (`backend/data/historical_matches.csv`)
    covering PL, PD, BL1, SA, FL1, and CL.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if HISTORICAL_CSV_PATH.exists() and not force:
        df = pd.read_csv(HISTORICAL_CSV_PATH)
        known = get_clubs_dict()
        for col in ("home_team", "away_team"):
            for name, lg in zip(df[col], df["league"]):
                if str(name) not in known:
                    register_dynamic_club(str(name), str(lg))
        return df

    from backend.build_real_dataset import download_real_matches
    return download_real_matches()


def sync_live_football_data_uk(seasons: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Extract, parse, and persist updated match data for the CURRENT active season
    from football-data.co.uk into `backend/data/historical_matches.csv`.
    Only data from the current season is updated, preserving all past chronological seasons.
    """
    active_season_label = get_current_season_label()
    active_season_code = get_current_season_code()

    clubs_dict = get_clubs_dict()
    synced_sources: List[str] = []
    current_season_matches: List[Dict[str, Any]] = []

    league_files = [
        ("E0", "PL"),
        ("SP1", "PD"),
        ("D1", "BL1"),
        ("I1", "SA"),
        ("F1", "FL1"),
    ]

    for fd_code, lg_code in league_files:
        url = f"https://www.football-data.co.uk/mmz4281/{active_season_code}/{fd_code}.csv"
        try:
            resp = requests.get(url, timeout=7)
            if resp.status_code != 200 or len(resp.text) < 200:
                continue
            raw_df = pd.read_csv(io.StringIO(resp.text))
            count_lg = 0
            for _, row in raw_df.iterrows():
                raw_home = str(row.get("HomeTeam", "")).strip()
                raw_away = str(row.get("AwayTeam", "")).strip()
                if not raw_home or not raw_away or raw_home == "nan" or raw_away == "nan":
                    continue
                if pd.isna(row.get("FTHG")) or pd.isna(row.get("FTAG")):
                    continue

                home_name = CSV_NAME_MAP.get(raw_home, raw_home)
                away_name = CSV_NAME_MAP.get(raw_away, raw_away)

                if home_name not in clubs_dict:
                    clubs_dict[home_name] = register_dynamic_club(home_name, lg_code)
                if away_name not in clubs_dict:
                    clubs_dict[away_name] = register_dynamic_club(away_name, lg_code)

                fthg = int(row["FTHG"])
                ftag = int(row["FTAG"])
                ftr = str(row.get("FTR", "D" if fthg == ftag else ("H" if fthg > ftag else "A"))).strip()

                raw_date = str(row.get("Date", ""))
                try:
                    parsed_dt = pd.to_datetime(raw_date, dayfirst=True).strftime("%Y-%m-%d")
                except Exception:
                    parsed_dt = datetime.now().strftime("%Y-%m-%d")

                hs = int(row["HS"]) if not pd.isna(row.get("HS")) else max(fthg + 3, 12)
                as_ = int(row["AS"]) if not pd.isna(row.get("AS")) else max(ftag + 3, 10)
                hst = int(row["HST"]) if not pd.isna(row.get("HST")) else max(fthg, int(hs * 0.36))
                ast = int(row["AST"]) if not pd.isna(row.get("AST")) else max(ftag, int(as_ * 0.35))

                hthg = int(row["HTHG"]) if not pd.isna(row.get("HTHG")) else int(fthg * 0.45)
                htag = int(row["HTAG"]) if not pd.isna(row.get("HTAG")) else int(ftag * 0.45)

                hc = int(row["HC"]) if not pd.isna(row.get("HC")) else 5
                ac = int(row["AC"]) if not pd.isna(row.get("AC")) else 4
                hf = int(row["HF"]) if not pd.isna(row.get("HF")) else 11
                af = int(row["AF"]) if not pd.isna(row.get("AF")) else 12
                hy = int(row["HY"]) if not pd.isna(row.get("HY")) else 2
                ay = int(row["AY"]) if not pd.isna(row.get("AY")) else 2
                hr = int(row["HR"]) if not pd.isna(row.get("HR")) else 0
                ar = int(row["AR"]) if not pd.isna(row.get("AR")) else 0

                h_xg = round(hst * 0.28 + (hs - hst) * 0.05 + fthg * 0.25, 2)
                a_xg = round(ast * 0.28 + (as_ - ast) * 0.05 + ftag * 0.25, 2)

                current_season_matches.append(
                    {
                        "date": parsed_dt,
                        "season": active_season_label,
                        "league": lg_code,
                        "matchday": 1,
                        "home_team": home_name,
                        "away_team": away_name,
                        "fthg": fthg,
                        "ftag": ftag,
                        "ftr": ftr,
                        "hthg": hthg,
                        "htag": htag,
                        "home_xg": h_xg,
                        "away_xg": a_xg,
                        "home_possession": 52.0,
                        "away_possession": 48.0,
                        "hs": hs,
                        "as": as_,
                        "hst": hst,
                        "ast": ast,
                        "hc": hc,
                        "ac": ac,
                        "hf": hf,
                        "af": af,
                        "hy": hy,
                        "ay": ay,
                        "hr": hr,
                        "ar": ar,
                    }
                )
                count_lg += 1
            synced_sources.append(f"{lg_code}-{active_season_code} ({count_lg} games)")
        except Exception as e:
            print(f"Sync warning for {lg_code}: {e}")
            continue

    # Load existing CSV database and preserve all historical seasons (2023/24, 2024/25, 2025/26) and UCL
    if HISTORICAL_CSV_PATH.exists():
        existing_df = pd.read_csv(HISTORICAL_CSV_PATH)
        historical_df = existing_df[existing_df["season"] != active_season_label]
        # Keep existing CL matches from the current season if any
        current_cl = existing_df[(existing_df["season"] == active_season_label) & (existing_df["league"] == "CL")]
    else:
        historical_df = pd.DataFrame()
        current_cl = pd.DataFrame()

    if current_season_matches:
        new_active_df = pd.DataFrame(current_season_matches)
        all_dfs = [historical_df, new_active_df]
        if not current_cl.empty:
            all_dfs.append(current_cl)
        merged = pd.concat(all_dfs, ignore_index=True)
        merged = merged.drop_duplicates(
            subset=["season", "league", "home_team", "away_team", "date"], keep="last"
        )
        merged = merged.sort_values(["date", "league"]).reset_index(drop=True)
        merged.to_csv(HISTORICAL_CSV_PATH, index=False)
        return {
            "status": "synced",
            "active_season": active_season_label,
            "newly_processed_rows": len(new_active_df),
            "total_matches_in_csv": len(merged),
            "synced_sources": synced_sources,
            "last_synced_at": datetime.now().isoformat(timespec="seconds"),
        }

    return {
        "status": "up_to_date",
        "active_season": active_season_label,
        "newly_processed_rows": 0,
        "total_matches_in_csv": len(historical_df),
        "synced_sources": synced_sources,
        "last_synced_at": datetime.now().isoformat(timespec="seconds"),
    }


def get_upcoming_fixtures(league_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Dynamically generate upcoming matchday fixtures for each competition
    using active season clubs and scheduling next matchday clashes.
    """
    df = generate_multi_season_dataset(force=False)
    current_season = get_current_season_label()
    base_date = datetime.now()

    results: List[Dict[str, Any]] = []
    fix_counter = 1

    target_leagues = (
        [league_code]
        if (league_code and league_code != "ALL" and league_code in LEAGUES)
        else ["PL", "PD", "BL1", "SA", "FL1", "CL"]
    )

    for lg in target_leagues:
        active_clubs = get_league_clubs(lg, season=current_season)
        sub = df[(df["league"] == lg) & (df["season"] == current_season)]

        # Determine next matchday based on completed games
        if not sub.empty:
            matches_per_team = len(sub) * 2 / max(1, len(active_clubs))
            next_md = int(round(matches_per_team)) + 1
        else:
            next_md = 9

        if lg != "CL":
            n_teams = len(active_clubs)
            top_half = active_clubs[: n_teams // 2]
            bottom_half = active_clubs[n_teams // 2 :]
            pairs = []
            for i in range(min(len(top_half), len(bottom_half))):
                if i % 2 == 0:
                    pairs.append((top_half[i], bottom_half[i]))
                else:
                    pairs.append((bottom_half[i], top_half[i]))

            if len(top_half) >= 4:
                pairs[0] = (top_half[0], top_half[1])
                pairs[1] = (top_half[2], top_half[3])

            for p_idx, (h_club, a_club) in enumerate(pairs[:6]):
                f_date = (base_date + timedelta(days=2 + (p_idx % 3))).strftime("%Y-%m-%d")
                results.append(
                    {
                        "id": f"fix-{fix_counter}",
                        "league": lg,
                        "league_name": LEAGUES[lg]["name"],
                        "league_flag": LEAGUES[lg]["flag"],
                        "stage": f"Matchday {next_md}",
                        "date": f_date,
                        "kickoff": "19:45 UTC" if p_idx == 0 else "15:00 UTC",
                        "stadium": h_club["stadium"],
                        "home_team": h_club["name"],
                        "home_short": h_club["short_name"],
                        "home_tla": h_club["tla"],
                        "home_color": h_club["primary_color"],
                        "home_elo": h_club["base_elo"],
                        "away_team": a_club["name"],
                        "away_short": a_club["short_name"],
                        "away_tla": a_club["tla"],
                        "away_color": a_club["primary_color"],
                        "away_elo": a_club["base_elo"],
                    }
                )
                fix_counter += 1
        else:
            ucl_clubs = list(active_clubs)
            pairs = []
            for i in range(0, min(12, len(ucl_clubs) - 1), 2):
                pairs.append((ucl_clubs[i], ucl_clubs[i + 1]))

            for p_idx, (h_club, a_club) in enumerate(pairs):
                f_date = (base_date + timedelta(days=3 + (p_idx % 2))).strftime("%Y-%m-%d")
                results.append(
                    {
                        "id": f"fix-{fix_counter}",
                        "league": "CL",
                        "league_name": LEAGUES["CL"]["name"],
                        "league_flag": LEAGUES["CL"]["flag"],
                        "stage": f"UCL League Phase — MD {next_md}",
                        "date": f_date,
                        "kickoff": "20:00 UTC",
                        "stadium": h_club["stadium"],
                        "home_team": h_club["name"],
                        "home_short": h_club["short_name"],
                        "home_tla": h_club["tla"],
                        "home_color": h_club["primary_color"],
                        "home_elo": h_club["base_elo"],
                        "away_team": a_club["name"],
                        "away_short": a_club["short_name"],
                        "away_tla": a_club["tla"],
                        "away_color": a_club["primary_color"],
                        "away_elo": a_club["base_elo"],
                    }
                )
                fix_counter += 1

    return results
