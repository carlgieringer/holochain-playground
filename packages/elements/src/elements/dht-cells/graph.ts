import { commonGraphStyles } from '../utils/common-graph-styles';

export const layoutConfig = {
  startAngle: (4 / 2) * Math.PI,
  ready: (e) => {
    e.cy.resize();
  },
};

export const graphStyles = `
  ${commonGraphStyles}
  node {
    background-color: lightblue;
    border-color: black;
    border-width: 2px;
    label: data(label);
    font-size: 20px;
    width: 50px;
    height: 50px;
  }
  
  .selected {
    border-width: 4px;
    border-color: black;
    border-style: solid;
  }

  .highlighted {
    background-color: yellow;
  }

  edge {
    width: 1;
  }

  .network-request {
    target-arrow-shape: triangle;
    label: data(label);
  }

  .neighbor-edge {
    line-style: dotted;
  }

  .far-neighbor-edge {
    line-style: dotted;
    opacity: 0.2;
  }

  .network-request {
    width: 10px;
    height: 10px;
    background-color: grey;
    border-width: 0px;
  }


  .not-held {
    height: 10px;
    width: 10px;
    background-color: white;
  }
`;

export const cytoscapeOptions = {
  boxSelectionEnabled: false,
  autoungrabify: true,
  userPanningEnabled: false,
  userZoomingEnabled: false,
  style: graphStyles,
};
