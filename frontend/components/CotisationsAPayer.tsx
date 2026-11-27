'use client';

import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StatutBadge from '@/components/ui/StatutBadge';
import { formaterDate, formaterMontant } from '@/lib/affichage';
import { totalCotisationsDues, type CotisationDue } from '@/lib/cotisations';

interface CotisationsAPayerProps {
  /** Déjà triées de la plus ancienne à la plus récente (voir lib/cotisations). */
  cotisations: CotisationDue[];
  onPayer: (cotisation: CotisationDue) => void;
  enCours?: boolean;
}

/**
 * Toutes les cotisations dues en un seul bloc. L'interface n'impose aucune
 * règle de priorité : elle affiche seulement l'interdiction déjà appliquée
 * par le backend et désactive les boutons en conséquence.
 */
export default function CotisationsAPayer({
  cotisations,
  onPayer,
  enCours = false,
}: CotisationsAPayerProps) {
  const total = totalCotisationsDues(cotisations);
  const premiereParTontine = new Map<string, CotisationDue>();
  for (const cotisation of cotisations) {
    if (!premiereParTontine.has(cotisation.tontineId)) {
      premiereParTontine.set(cotisation.tontineId, cotisation);
    }
  }

  return (
    <Card id="cotisations-a-payer" className="scroll-mt-header p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-section font-semibold text-ink">Cotisations à payer</h2>
          <p className="mt-1 text-body text-muted-canvas">
            Toutes vos cotisations non payées, de la plus ancienne à la plus récente.
          </p>
        </div>
        {cotisations.length > 0 && (
          <p
            aria-live="polite"
            className="rounded-pill bg-canvas px-4 py-2 text-body font-semibold tabular-nums text-ink"
          >
            À payer : {formaterMontant(total)}
          </p>
        )}
      </div>

      {cotisations.length === 0 ? (
        <p className="mt-4 text-body text-muted-canvas">Aucune cotisation à régler.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {cotisations.map((cotisation) => {
            const premiere = premiereParTontine.get(cotisation.tontineId);
            const bloquee = premiere !== cotisation;

            return (
              <li key={cotisation.id} className="rounded-card border border-line bg-canvas p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lead font-semibold text-ink">
                      {cotisation.tontineNom}
                    </p>
                    <p className="mt-1 text-meta text-muted-canvas">
                      Tour {cotisation.cycle} sur {cotisation.cycleActuel}
                    </p>
                  </div>
                  <StatutBadge statut={cotisation.statut} />
                </div>

                <dl className="mt-4 grid gap-3 text-body sm:grid-cols-3">
                  <div>
                    <dt className="text-meta text-muted-canvas">Date d’échéance</dt>
                    <dd className="font-semibold tabular-nums">
                      {formaterDate(cotisation.dateEcheance)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-meta text-muted-canvas">Montant</dt>
                    <dd className="font-semibold tabular-nums">
                      {formaterMontant(cotisation.montant)}
                    </dd>
                  </div>
                  {cotisation.amende > 0 && (
                    <div>
                      <dt className="text-meta text-muted-canvas">Amende</dt>
                      <dd className="font-semibold tabular-nums text-danger">
                        {formaterMontant(cotisation.amende)}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    disabled={bloquee || enCours}
                    onClick={() => onPayer(cotisation)}
                    aria-describedby={bloquee ? `blocage-${cotisation.id}` : undefined}
                  >
                    {enCours ? 'Traitement en cours...' : 'Payer'}
                  </Button>
                  {bloquee && premiere && (
                    <p id={`blocage-${cotisation.id}`} className="text-meta text-danger">
                      Réglez d’abord la cotisation du {formaterDate(premiere.dateEcheance)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
