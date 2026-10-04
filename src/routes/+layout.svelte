<script lang="ts">
  import '../app.css'
  import { ModeWatcher } from 'mode-watcher'

  let { children } = $props()
</script>

<!-- Light or dark follows the device unless Settings says otherwise. -->
<ModeWatcher defaultMode="system" themeColors={{ light: '#ffffff', dark: '#18181b' }} />
{@render children()}
