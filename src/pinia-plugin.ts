import { ref, reactive, watch } from 'vue'
import { PiniaPluginContext, defineStore } from 'pinia'
import { useQuery, useMutation } from 'vue-query'
// prettier-ignore
import { indexRequest, getRequest, createRequest, updateRequest, deleteRequest } from './requests'
import { processIndexData, processGetData } from './utils'
import { ResourceObject, DocWithData, NewResourceObject } from './types'

export function JsonApiPiniaPlugin(context: PiniaPluginContext) {
  const { store, options } = context

  const resourceType = options.resourceType || store.$id

  // Store JSON:API root data (when returning a collection)
  const data = ref({})
  const meta = ref({})
  const links = ref({})

  store.data = data
  store.$state.data = data
  store.meta = meta
  store.$state.meta = meta
  store.links = links
  store.$state.links = links

  const normalizationMaxRecursion = options.maxNestedRelationshipsNormalization || 1
  // Function to normalize an JSON:API item
  store.normalizedItem = (itemId: string, currentRecursion: number = 0) => {
    const item = data.value[itemId]
    if (!item) {
      return undefined
    }
    const itemRelationships = {}
    if (item.relationships && currentRecursion < maxRecursion) {
      Object.keys(item.relationships).forEach((key) => {
        const relData = item.relationships[key].data
        if (!relData) {
          itemRelationships[key] = undefined
        } else {
          if (Array.isArray(relData)) {
            itemRelationships[key] = relData.map((data) => {
              const useRelStore = defineStore(data.type, () => ({}), {
                query: false
              })
              const relStore = useRelStore()
              return relStore.normalizedItem(data.id, currentRecursion + 1)
            })
          } else {
            const useRelStore = defineStore(relData.type, () => ({}), {
              query: false
            })
            const relStore = useRelStore()
            itemRelationships[key] = relStore.normalizedItem(relData.id, currentRecursion + 1)
          }
        }
      })
    }
    return {
      id: item.id,
      type: item.type,
      ...item.attributes,
      ...itemRelationships,
      meta: item.meta,
      links: item.links
    }
  }

  // Add the actions if the store is called from a setup function
  const queryEnabled = options.query != false
  if (queryEnabled) {
    const queryOptions = (options.query === true ? {} : options.query) as {
      index?: object
      get?: object
      create?: object
      update?: object
      delete?: object
    }

    const indexKey = reactive([resourceType, {}])
    const indexQuery = useQuery(
      indexKey,
      () => indexRequest(resourceType, indexKey[1]),
      {
        keepPreviousData: true,
        staleTime: 10000,
        ...queryOptions?.index
      }
    )
    store.indexQuery = indexQuery
    store.$state.indexQuery = indexQuery
    store.index = async (queryParams: { [key: string]: any } = {}) => {
      indexKey[1] = queryParams
    }

    watch(indexQuery.data, (newData: DocWithData) => {
      processIndexData(newData, context)
    })

    const getKey = reactive([resourceType, '', {}])
    const getQuery = useQuery(
      getKey,
      () => getRequest(resourceType, getKey[1], getKey[2]),
      {
        staleTime: 10000,
        ...queryOptions?.get
      }
    )
    store.getQuery = getQuery
    store.$state.getQuery = getQuery
    store.get = async (
      id: string,
      queryParams: { [key: string]: any } = {}
    ) => {
      getKey[1] = id
      getKey[2] = queryParams
    }

    watch(getQuery.data, (newData: DocWithData) => {
      processGetData(newData, context)
    })

    const createQuery = useMutation(
      (body: any) => createRequest(resourceType, body),
      {
        onSuccess: (json: DocWithData | string, body: NewResourceObject) => {
          if (typeof json === 'string') {
            data.value[body.id] = body
          } else {
            const elementData = json.data as ResourceObject
            data.value[elementData.id] = elementData
          }
        },
        ...queryOptions?.create
      }
    )
    store.createQuery = createQuery
    store.$state.createQuery = createQuery
    store.create = async (body: NewResourceObject) => {
      createQuery.mutate(body)
    }

    const updateQuery = useMutation(
      (params: { id: string; body: any }) =>
        updateRequest(resourceType, params.id, params.body),
      {
        onSuccess: (json: DocWithData | string, variables: { id: string }) => {
          if (typeof json === 'string') {
            store.get(variables.id)
          } else {
            const elementData = json.data as ResourceObject
            data.value[elementData.id] = elementData
          }
        },
        ...queryOptions?.update
      }
    )
    store.updateQuery = updateQuery
    store.$state.updateQuery = updateQuery
    store.update = async (id: string, body: ResourceObject) => {
      updateQuery.mutate({ id, body })
    }

    const deleteQuery = useMutation(
      (id: string) => deleteRequest(resourceType, id),
      {
        onSuccess: (_: any, id: string) => {
          delete data.value[id]
        },
        ...queryOptions?.delete
      }
    )
    store.deleteQuery = deleteQuery
    store.$state.deleteQuery = deleteQuery
    store.delete = async (id: string) => {
      deleteQuery.mutate(id)
    }
  }
}
