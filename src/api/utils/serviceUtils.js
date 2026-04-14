class ServiceUtils {

  mergeAppStateOptions(defaultOptions={}, options={}) {
    const errorSettings = {...(defaultOptions.errorSettings || {}), ...(options.errorSettings || {})};
    const loaderSettings = {...(defaultOptions.loaderSettings || {}), ...(options.loaderSettings || {})};
    return {...defaultOptions, ...options, errorSettings, loaderSettings};
  }
}

export default new ServiceUtils();