# Sources officielles de la veille : obtenir les accès

Guide pour le Business Owner (cahier des charges v1.33, BES-46). Les sources officielles sont **gratuites**.
Elles n'ont besoin que d'identifiants d'application, que **vous** créez et que vous placez dans la configuration du
serveur. Claude Code ne les lit jamais (`.env` interdit), l'API ne les renvoie jamais et les journaux ne les contiennent
jamais (ENF-SEC-23).

| Source | Compte | Variables | Ce que la source reçoit |
|---|---|---|---|
| France Travail (Offres d'emploi v2) | francetravail.io | `FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_CLIENT_SECRET` | Vos critères : métiers, codes ROME, commune et rayon, contrats |
| La bonne alternance (API Apprentissage) | api.apprentissage.beta.gouv.fr | `LBA_API_KEY` | Vos codes ROME, les coordonnées de votre commune et le rayon |
| Recherche d'entreprises (SIREN) | aucun | aucune | Le nom des entreprises de vos candidatures |
| Découpage administratif (communes) | aucun | aucune | Le nom de commune que vous tapez |

Aucune donnée d'identité ni de contact ne quitte le serveur (ENF-RGP-11), et les coordonnées des recruteurs ne sont
jamais conservées (ENF-RGP-09).

## France Travail

1. Créez un compte sur <https://francetravail.io/inscription>. Un compte de particulier suffit.
2. Dans l'espace « Mes applications », créez une application :
   - nom : « Tracandi » ;
   - description : « Veille personnelle d'offres d'emploi, usage non commercial » ;
   - si le site en demande une, adresse de retour : celle de l'interface.
3. Dans cette application, ajoutez l'API **« Offres d'emploi v2 »** et acceptez ses conditions d'utilisation et la
   licence de réutilisation des offres.
4. Copiez l'**identifiant client** et la **clé secrète** de l'application.
5. Renseignez-les dans la configuration du serveur, jamais dans le dépôt :
   - **en local**, dans `.env` :
     ```
     FRANCE_TRAVAIL_CLIENT_ID=<identifiant client>
     FRANCE_TRAVAIL_CLIENT_SECRET=<clé secrète>
     ```
   - **sur Northflank** : dans les variables secrètes du service de l'API, avec les mêmes noms.
6. Redémarrez l'API. Au démarrage, elle refuse une configuration qui ne contient qu'une seule des deux variables.
7. Dans Tracandi :
   - dans **Sites surveillés**, renseignez **Ce que vous recherchez** ;
   - cliquez sur **Activer France Travail** ;
   - lancez **Consulter maintenant**.

**Vérifier.** La source France Travail affiche l'heure de sa dernière consultation et le nombre d'offres repérées. Si
elle indique « Identifiants France Travail non configurés », les deux variables n'ont pas été lues au démarrage. Si elle
indique « France Travail a refusé les identifiants », l'identifiant ou la clé est faux, ou l'API « Offres d'emploi
v2 » n'est pas ajoutée à l'application.

**Ce que fait Tracandi.**
- Il obtient un jeton d'accès, gardé en mémoire seulement (environ 25 minutes).
- Il envoie une recherche par métier et par type de contrat, et une par codes ROME.
- Chaque recherche porte sur les offres publiées depuis la consultation précédente (une semaine à la première).
- Il fait au plus 5 appels par seconde, soit la moitié du débit publié (ENF-COL-05).
- Il écarte les offres relayées pour LinkedIn, Indeed ou Welcome to the Jungle (EF-VEI-33).
- Chaque offre renvoie à sa page sur francetravail.fr et nomme sa source, comme le demande la licence de réutilisation.

**Révoquer.** Supprimez l'application dans francetravail.io, puis videz les deux variables.

## La bonne alternance

À faire seulement si l'une de vos cibles accepte l'**alternance** : cette source ne publie que des offres en
apprentissage ou en professionnalisation.

1. Créez un compte sur <https://api.apprentissage.beta.gouv.fr>. Une adresse e-mail suffit : le site envoie un lien de
   connexion.
2. Dans votre espace (« Mon compte », rubrique du jeton d'accès), générez un **jeton d'API** et copiez-le. Les
   conditions d'utilisation interdisent de le divulguer, de revendre les données ou de les transmettre à des tiers :
   Tracandi ne fait ni l'un ni l'autre (usage personnel).
3. Renseignez-le dans `.env` (ou dans les variables secrètes de Northflank) :
   ```
   LBA_API_KEY=<jeton>
   ```
4. Redémarrez l'API.
5. Dans Tracandi, vérifiez que **Ce que vous recherchez** contient :
   - une cible qui accepte l'alternance ;
   - au moins un **code ROME**, par exemple M1419 (data analyst) ou M1811 (data engineer).

   Cliquez ensuite sur **Activer La bonne alternance**.

**Vérifier.** Si l'activation est refusée, le message dit ce qui manque dans vos critères. Si la source indique « Clé La
bonne alternance non configurée », la variable n'a pas été lue au démarrage. Si elle indique « a refusé la clé
d'accès », le jeton est faux ou a été révoqué.

**Ce que fait Tracandi.**
- Il fait une seule recherche par consultation : vos codes ROME, autour de votre commune, dans votre rayon (200 km au
  plus).
- Il fait au plus un appel toutes les deux secondes, soit la moitié du débit publié.
- Il ne garde que les offres ouvertes, sans jamais le téléphone du recruteur.
- Il écarte les offres relayées pour Indeed, LinkedIn ou WTTJ.
- Il conserve le SIREN de l'employeur, pour signaler les entreprises où vous avez déjà postulé.

## Recherche d'entreprises (SIREN)

Rien à faire : l'API est publique et sans compte.

- À chaque passe, Tracandi cherche le SIREN de dix entreprises de vos candidatures au plus. Il ne le retient que si
  une seule entreprise active porte ce nom (EF-VEI-36).
- Les dirigeants ne sont jamais demandés (`minimal=true`).
- Une entreprise non trouvée est recherchée de nouveau un mois plus tard.

Ce SIREN permet d'afficher « Vous y avez déjà postulé » sur une offre publiée sous un autre nom que celui de votre
candidature.
