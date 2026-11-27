'use client';

import { useEffect, useState } from 'react';
import Button from './Button';
import Modal from './Modal';
import { formaterMontant } from '@/lib/affichage';

const PROVIDERS = [
  { id: 'WAVE', label: 'Wave' },
  { id: 'ORANGE_MONEY', label: 'Orange Money' },
] as const;

interface PaymentModalProps {
  ouvert: boolean;
  onFermer: () => void;
  tontineNom?: string;
  montantCotisation: number;
  amende?: number | null;
  total?: number | null;
  cycleConcerne?: number | null;
  enCours: boolean;
  onConfirmer: (provider: string) => void;
}

/**
 * Paiement en deux étapes maximum :
 * 1. lecture du récapitulatif et choix du moyen de paiement ;
 * 2. confirmation, avec état de traitement puis message de confirmation.
 * Aucun montant n’est inventé : les valeurs viennent de l’API ou du détail.
 */
export default function PaymentModal({
  ouvert,
  onFermer,
  tontineNom,
  montantCotisation,
  amende = 0,
  total,
  cycleConcerne,
  enCours,
  onConfirmer,
}: PaymentModalProps) {
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    if (ouvert) setProvider(null);
  }, [ouvert]);

  const amendeCalculee = amende ?? 0;
  const totalAPayer = total ?? montantCotisation + amendeCalculee;

  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Payer votre cotisation">
      <div className="space-y-4">
        <p className="text-meta text-muted-canvas">
          Étape 1 sur 2 · Vérifiez le montant et choisissez votre moyen de paiement.
        </p>

        <div className="rounded-card border border-line bg-canvas p-4">
          {tontineNom && <p className="mb-3 text-body font-semibold text-ink">{tontineNom}</p>}
          {cycleConcerne && (
            <p className="mb-3 text-meta text-muted-canvas">Tour {cycleConcerne}</p>
          )}
          <dl className="space-y-2 text-body">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-canvas">Cotisation</dt>
              <dd className="tabular-nums font-semibold">{formaterMontant(montantCotisation)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-canvas">Frais</dt>
              <dd className="tabular-nums font-semibold">{formaterMontant(0)}</dd>
            </div>
            {amendeCalculee > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-canvas">Amende</dt>
                <dd className="tabular-nums font-semibold">{formaterMontant(amendeCalculee)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-line pt-2">
              <dt className="font-semibold text-ink">Total à payer</dt>
              <dd className="font-display text-lead font-semibold tabular-nums text-ink">
                {formaterMontant(totalAPayer)}
              </dd>
            </div>
          </dl>
        </div>

        <fieldset>
          <legend className="text-body font-medium text-ink">Moyen de paiement</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROVIDERS.map((p) => (
              <Button
                key={p.id}
                variant={provider === p.id ? 'primary' : 'secondary'}
                aria-pressed={provider === p.id}
                disabled={enCours}
                onClick={() => setProvider(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </fieldset>

        <Button
          className="w-full"
          disabled={!provider || enCours}
          onClick={() => provider && onConfirmer(provider)}
        >
          {enCours ? 'Traitement en cours...' : 'Confirmer le paiement'}
        </Button>

        <p className="text-meta text-muted-canvas">
          Étape 2 sur 2 · Le paiement est enregistré après confirmation du serveur.
        </p>
      </div>
    </Modal>
  );
}
