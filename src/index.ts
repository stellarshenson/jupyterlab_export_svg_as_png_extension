import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { requestAPI } from './request';

/**
 * Initialization data for the jupyterlab_copy_svg_as_png_extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_copy_svg_as_png_extension:plugin',
  description: 'Jupyterlab extension to allow copying and exporting any given SVG graphics as PNG',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyterlab_copy_svg_as_png_extension is activated!');

    requestAPI<any>('hello', app.serviceManager.serverSettings)
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The jupyterlab_copy_svg_as_png_extension server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default plugin;
