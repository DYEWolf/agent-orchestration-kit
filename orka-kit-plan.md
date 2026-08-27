 Sincroniza la convención de Wayfinder de este repositorio con la implementación corregida de Vesti.

  Usa `/Users/chris/Documents/dev/vesti` únicamente como referencia de lectura. No modifiques Vesti.

  La decisión canónica es:

  1. No crear ni depender de estas labels:

     - `wayfinder:map`

     - `wayfinder:research`

     - `wayfinder:prototype`

     - `wayfinder:grilling`

     - `wayfinder:task`

  2. Mantener `ready-for-agent` como la única label necesaria para señalar que una GitHub Issue de implementación:

     - pasó por spec y tickets;

     - tiene contrato, aceptación y verificación completos;

     - está lista para reclamar y obtener su issue-owned Orca Run.

  3. Representar Wayfinder mediante metadata en el cuerpo:

     Mapa:

     ```markdown

     Type: wayfinder-map

  Hijo:

     Type: wayfinder-&lt;research|prototype|grilling|task&gt;

     Part of: #&lt;map&gt;

  4. Usar las relaciones nativas de GitHub como representación canónica:

      - sub-issues para jerarquía;

      - issue dependencies para bloqueos;

      - assignee para ownership.

     Si una capacidad nativa no está disponible:

      - usar una task list en el mapa como fallback de jerarquía;

      - usar Blocked by: #&lt;issue&gt; como fallback de dependencia.

  5. Type: wayfinder-task es metadata de planificación. No significa que el Issue esté aprobado para implementación, no debe recibir automáticamente ready-for-agent y no debe crear por sí solo un Orca Run.

  6. Antes de editar, busca todas las referencias antiguas:

     rg -n --hidden \

       --glob '!node_modules' \

       --glob '!.git' \

       'wayfinder:(map|research|prototype|grilling|task)|wayfinder:&lt;type&gt;|--label wayfinder' .

  7. Actualiza, según existan en orca-kit:

      - .agents/skills/wayfinder/[SKILL.md](http://SKILL.md)

      - docs/agents/[issue-tracker.md](http://issue-tracker.md)

      - .agents/skills/setup-matt-pocock-skills/[issue-tracker-github.md](http://issue-tracker-github.md)

      - .agents/skills/setup-matt-pocock-skills/[issue-tracker-local.md](http://issue-tracker-local.md)

      - cualquier otra plantilla que todavía requiera labels wayfinder:*

     Toma como referencia semántica estos archivos de Vesti:

      - /Users/chris/Documents/dev/vesti/.agents/skills/wayfinder/[SKILL.md](http://SKILL.md)

      - /Users/chris/Documents/dev/vesti/docs/agents/[issue-tracker.md](http://issue-tracker.md)

      - /Users/chris/Documents/dev/vesti/.agents/skills/setup-matt-pocock-skills/[issue-tracker-github.md](http://issue-tracker-github.md)

      - /Users/chris/Documents/dev/vesti/.agents/skills/setup-matt-pocock-skills/[issue-tracker-local.md](http://issue-tracker-local.md)

     Conserva nombres, rutas y particularidades propias de orca-kit; no copies texto específico de Vesti que no aplique.

  8. No crees las cinco labels Wayfinder remotamente. Conserva ready-for-agent, que ya existe.

  9. Valida al terminar:

      - que no queden dependencias activas de labels wayfinder:*;

      - que el documento activo y su seed coincidan si esa duplicación existe;

      - las skills modificadas con quick_[validate.py](http://validate.py);

      - git diff --check;

      - git status --short.

  10. No hagas commit. Entrega:

      - archivos modificados;

      - resumen de la nueva convención;

      - resultados de validación;

      - cualquier diferencia deliberada respecto a Vesti.