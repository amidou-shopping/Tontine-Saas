from datetime import datetime, timedelta, timezone
from app.models import JourSemaine

JOUR_SEMAINE_MAP = {
    JourSemaine.LUNDI: 0,
    JourSemaine.MARDI: 1,
    JourSemaine.MERCREDI: 2,
    JourSemaine.JEUDI: 3,
    JourSemaine.VENDREDI: 4,
    JourSemaine.SAMEDI: 5,
    JourSemaine.DIMANCHE: 6,
}

def prochain_jour(depuis: datetime, jour: JourSemaine) -> datetime:
    """Calcule la date du prochain jour donné à minuit UTC."""
    cible = JOUR_SEMAINE_MAP[jour]
    actuel = depuis.weekday()
    jours_a_ajouter = (cible - actuel) % 7
    if jours_a_ajouter == 0:
        jours_a_ajouter = 7
    prochaine_date = depuis + timedelta(days=jours_a_ajouter)
    return prochaine_date.replace(hour=0, minute=0, second=0, microsecond=0)

def date_du_tour(date_debut: datetime, tour: int) -> datetime:
    """Calcule la date d'échéance pour un tour donné (hebdomadaire, +7 jours par tour)."""
    return date_debut + timedelta(days=(tour - 1) * 7)
