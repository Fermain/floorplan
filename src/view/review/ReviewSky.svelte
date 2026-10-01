<script lang="ts">
  import { untrack } from 'svelte'
  import { T, useThrelte } from '@threlte/core'
  import { Color, Fog, Vector3 } from 'three'
  import { Sky } from 'three/examples/jsm/objects/Sky.js'

  // A sky lit by the sun the shadows come from, a haze at the horizon, and light from the sky and the ground.
  let { sun, centre }: { sun: { x: number; y: number; z: number }; centre: { x: number; y: number; z: number } } = $props()

  const { scene, renderer, invalidate } = useThrelte()
  const sky = new Sky()
  sky.scale.setScalar(1500)
  const uniforms = sky.material.uniforms
  uniforms.turbidity.value = 4
  uniforms.rayleigh.value = 1.2
  uniforms.mieCoefficient.value = 0.004
  uniforms.mieDirectionalG.value = 0.8

  // Daylight from 0 with the sun on the horizon to 1 once it is a little way up.
  const day = $derived(Math.min(1, Math.max(0, (sun.y + 0.03) / 0.2)))
  const haze = $derived(new Color('#1d2533').lerp(new Color('#cfdde9'), day))

  $effect(() => {
    scene.add(sky)
    const fog = new Fog(untrack(() => haze), 50, 170)
    scene.fog = fog
    const exposure = renderer.toneMappingExposure
    renderer.toneMappingExposure = 0.55
    return () => {
      scene.remove(sky)
      scene.fog = null
      renderer.toneMappingExposure = exposure
    }
  })

  $effect(() => {
    sky.position.set(centre.x, 0, centre.z)
    ;(uniforms.sunPosition.value as Vector3).set(sun.x, sun.y, sun.z).normalize()
    if (scene.fog instanceof Fog) scene.fog.color.copy(haze)
    invalidate()
  })
</script>

<T.HemisphereLight args={['#c4dcf2', '#6e7f52', 0.25 + 0.45 * day]} />
