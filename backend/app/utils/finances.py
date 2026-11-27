import math

def arrondi_fcfa(montant: float) -> int:
    """Arrondi les montants en FCFA entiers."""
    return int(round(montant))

def calculer_commission(montant: float, taux_commission: float = 0.03) -> int:
    """Calcule la commission plateforme (ex: 3%)."""
    return arrondi_fcfa(montant * taux_commission)

def calculer_amende(montant_cotisation: float, taux_amende: float = 0.10) -> int:
    """Calcule l'amende de retard (ex: 10%)."""
    return arrondi_fcfa(montant_cotisation * taux_amende)
