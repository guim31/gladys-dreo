# Dreo

Pilotez vos ventilateurs, chauffages, purificateurs d'air et humidificateurs **Dreo** depuis Gladys, par le cloud
Dreo — le service qu'utilise l'application Dreo. Les états arrivent en temps réel : une vitesse changée à la
télécommande ou dans l'application s'affiche dans Gladys en une seconde.

> Cette intégration a été **développée sans le matériel** : elle s'appuie sur les vraies réponses du cloud Dreo
> publiées par le projet Home Assistant `hass-dreo`. Vos retours sont bienvenus, sur le forum Gladys ou dans une
> issue GitHub. Elle n'est **pas affiliée à Dreo**.

## Présentation

| Appareil Dreo                                              | Ce que vous obtenez dans Gladys                                                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Ventilateurs colonne (DR-HTF…)                             | marche/arrêt, vitesse, mode, oscillation, température de la pièce                                                           |
| Brasseurs d'air / ventilateurs sur pied (DR-HAF…, DR-HPF…) | marche/arrêt, vitesse, mode, oscillation (horizontale et verticale), température de la pièce                                |
| Ventilateurs de plafond (DR-HCF…)                          | marche/arrêt du ventilateur, vitesse, mode (dont inversé)                                                                   |
| Chauffages (DR-HSH…, WH…)                                  | marche/arrêt (voir la partie sécurité), consigne, mode, puissance, température de la pièce, sécurité enfant (lecture seule) |
| Purificateurs d'air (DR-HAP…)                              | marche/arrêt, vitesse, mode, PM2.5, durée de vie du filtre (si exprimée en %)                                               |
| Humidificateurs (DR-HHM…)                                  | marche/arrêt, mode, consigne d'humidité, brumisation, humidité, réservoir ou niveau d'eau                                   |

Les autres produits Dreo (climatiseurs, déshumidificateurs, ventilateurs brumisateurs, cuiseurs) sont listés par
le bouton « Actualiser les appareils » comme « pas encore pris en charge ».

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent.
- Un compte Dreo, avec les appareils installés dans l'application Dreo (Wi-Fi, pièce…).
- Un accès à Internet pour Gladys : tout passe par le cloud Dreo.

## Configuration

1. Dans Gladys, **Intégrations → Installer depuis GitHub**, puis saisissez `https://github.com/guim31/gladys-dreo`.
2. Dans l'écran de configuration, saisissez l'**adresse e-mail** et le **mot de passe** de votre compte Dreo.
3. **Région du compte** : Europe ou Amérique du Nord. En cas d'erreur, l'intégration bascule toute seule.
4. **Langue des noms de fonctionnalités** : les noms donnés aux fonctionnalités quand vous ajoutez un appareil
   (français par défaut).
5. **Autoriser l'allumage des chauffages depuis Gladys** : désactivé par défaut, voir plus bas.
6. Ouvrez l'onglet **Découverte** et ajoutez les appareils voulus.

Le mot de passe ne sert qu'à se connecter ; l'intégration garde le jeton de session dans son volume privé `/data`
et ne se reconnecte que quand Dreo le demande.

## Appareils

La marche/arrêt est un interrupteur classique. Le **mode** est une liste des modes que votre modèle possède
vraiment (normal, naturel, sommeil, auto, turbo…). Les vitesses vont de 1 au maximum de votre modèle. Les
températures sont converties en degrés Celsius.

### Ventilateurs

L'**oscillation** utilise le réglage d'oscillation des ventilateurs de Gladys : _arrêt_ ou _gauche-droite_ sur les
ventilateurs colonne, plus _haut-bas_ et _les deux_ sur les brasseurs d'air inclinables. Sur les ventilateurs de
plafond avec lampe, allumer le ventilateur n'allume jamais la lampe.

### Chauffages

Pour votre sécurité, **un chauffage ne peut pas être allumé depuis Gladys**, sauf si vous activez « Autoriser
l'allumage des chauffages depuis Gladys » : personne n'est peut-être dans la pièce pour le surveiller. L'**éteindre**,
changer sa **consigne** et le suivre fonctionnent toujours. Tant qu'un chauffage est éteint et l'option désactivée,
son mode et sa puissance ne peuvent pas non plus être changés (certains modèles pourraient démarrer en recevant un
mode). La **sécurité enfant** est affichée, jamais pilotée. Les chauffages Dreo suivent la consigne en mode **Éco** ;
en mode **Chauffage**, ils suivent la puissance (H1, H2…).

### Purificateurs d'air

Les PM2.5 sont en µg/m³. Les purificateurs qui demandent une commande « auto » particulière (`auto-regular`,
`auto-silent`) la reçoivent automatiquement. La durée de vie du filtre s'affiche sur les modèles qui la donnent en
pourcentage.

### Humidificateurs

La consigne d'humidité (30 à 90 %) est celle du mode en cours (auto ou sommeil). Le réservoir affiche _Bas_ quand
il est vide ; les modèles avec une jauge affichent plutôt le niveau en pourcentage.

## Widget

Le widget **Appareils Dreo** montre tous les appareils Dreo ajoutés à Gladys sur une carte — allumés, éteints ou
hors ligne, avec leur mode, leur vitesse et leur température — et un bouton **Tout éteindre** (avec confirmation).
Ajoutez-le depuis l'éditeur du tableau de bord.

## Déclencheur de scène

**Appareil Dreo en ligne ou hors ligne** : un appareil a perdu sa connexion au cloud Dreo (débranché, Wi-Fi coupé),
ou l'a retrouvée. Choisissez un appareil et/ou le changement, ou laissez vide. Variables : le nom de l'appareil et
le nouvel état (`online` ou `offline`).

## Action de scène

**Éteindre les appareils Dreo** : éteint tous les appareils Dreo ajoutés à Gladys qui sont allumés, ou seulement les
types choisis (ventilateurs, chauffages, purificateurs, humidificateurs). Sortie : le nombre d'appareils éteints.

## Exemples de scènes

- **Départ de la maison** : quand la dernière personne part, lancez _Éteindre les appareils Dreo_ avec le type
  _Chauffages_, puis envoyez-vous un message avec le nombre d'appareils éteints.
- **Trop chaud dans la chambre** : quand la température de la chambre dépasse 26 °C après 22 h, allumez le
  ventilateur colonne en mode _Sommeil_ à la vitesse 2.
- **Chauffage débranché** : quand le chauffage du salon passe hors ligne, envoyez une notification.
- **Air sec** : quand l'humidité mesurée par l'humidificateur descend sous 35 %, réglez sa consigne à 50 %.

## Mise à jour des états

L'intégration garde un WebSocket ouvert avec le cloud Dreo, comme l'application : les changements arrivent aussitôt.
Toutes les 10 minutes, elle relit aussi l'état des appareils ajoutés à Gladys, au cas où un événement serait perdu,
et renvoie une valeur inchangée toutes les 6 heures pour que Gladys n'affiche jamais « Pas de valeur récente ». Dreo
ne publie aucun quota pour cette API : l'intégration reste très en dessous de ce que fait l'application (une
connexion, puis une requête par appareil toutes les 10 minutes), et n'envoie à Gladys que les valeurs qui changent.

## Dépannage

- **« Dreo a refusé l'adresse e-mail ou le mot de passe »** : vérifiez-les dans l'application Dreo ; l'intégration
  ne réessaie pas seule, pour ne pas bloquer votre compte. Enregistrez de nouveau la configuration pour réessayer.
- **« Le cloud Dreo est injoignable »** : vérifiez l'accès à Internet de Gladys ; l'intégration réessaie chaque
  minute, puis de moins en moins souvent.
- **Une commande échoue avec « n'a pas confirmé »** : l'appareil est peut-être hors ligne ou occupé ; vérifiez-le
  dans l'application Dreo.
- **Un chauffage ne répond pas** : les chauffages Dreo coupent la commande à distance après 24 heures sans
  utilisation (règle de sécurité) ; appuyez sur le bouton Wi-Fi du chauffage.
- **Un appareil manque** : appuyez sur « Actualiser les appareils » dans l'écran de configuration, puis regardez
  l'onglet Découverte.
- Pour le détail, réglez la variable d'environnement `LOG_LEVEL=debug` et lisez les journaux de l'intégration : ils
  ne contiennent jamais votre mot de passe ni votre jeton.

## Limites

- Développée sans le matériel : les modèles sont ceux de `hass-dreo`, les bornes d'un modèle absent de ses tables
  sont estimées.
- Cloud uniquement : pas de commande locale, rien ne fonctionne sans Internet.
- Les lampes des ventilateurs de plafond, les éclairages d'ambiance, les minuteries, les réglages d'écran et de son
  ne sont pas proposés.
- Les climatiseurs, déshumidificateurs, ventilateurs brumisateurs et cuiseurs ne sont pas encore pris en charge.
- Dreo donne les températures en °F : la conversion arrondit au dixième de degré, et la consigne au degré.
- L'API du cloud Dreo n'est pas publique : Dreo peut la changer sans prévenir.
