<script lang="ts">
  import { useTask, useThrelte } from '@threlte/core'
  import { Mesh, MeshStandardMaterial, type Material } from 'three'

  // Seeing the services: everything built fades to a ghost of itself so the pipes and cables in it show through.
  let { on }: { on: boolean } = $props()

  const { scene, invalidate } = useThrelte()

  const GHOST = 0.14
  // The ground stays more solid, so the house still reads as standing on something.
  const GHOST_GROUND = 0.5

  type Kept = { transparent: boolean; opacity: number; depthWrite: boolean }

  function fade(material: Material, ground: boolean) {
    if (!(material instanceof MeshStandardMaterial)) return
    const kept = material.userData.solid as Kept | undefined
    if (on && !kept) {
      material.userData.solid = { transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite } satisfies Kept
      material.transparent = true
      material.opacity = material.opacity * (ground ? GHOST_GROUND : GHOST)
      material.depthWrite = false
      material.needsUpdate = true
    } else if (!on && kept) {
      material.transparent = kept.transparent
      material.opacity = kept.opacity
      material.depthWrite = kept.depthWrite
      material.userData.solid = undefined
      material.needsUpdate = true
    }
  }

  // Meshes come and go as the house is rebuilt, so this is done every frame rather than once.
  useTask(
    () => {
      scene.traverse((object) => {
        if (!(object instanceof Mesh) || object.userData.service) return
        const ground = object.userData.ground === true
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) fade(material, ground)
      })
    },
    { autoInvalidate: false },
  )

  $effect(() => {
    void on
    invalidate()
  })
</script>
