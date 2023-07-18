const axios = require("axios");
const Table = require("cli-table3");

class ComponentsAnalyzer {
  constructor(axiosInstance, renderFunction, cloudName, projectKey) {
    this.axiosInstance = axiosInstance;
    this.renderFunction = renderFunction;
    this.cloudName = cloudName;
    this.projectKey = projectKey;
  }
  async #getComponentsWoLead() {
    const componentsConfig = {
      method: "get",
      url: `https://${this.cloudName}.atlassian.net/rest/api/3/project/${this.projectKey}/components`,
    };

    /**
     * Let's assume we have sane number of components and we can fetch them all at once
     */
    let response = await axios.request(componentsConfig);

    return (
      response?.data
        ?.filter((component) => component?.lead === undefined)
        .map((component) => component?.id) ?? []
    );
  }
  async #getIssuesCountByComponent(components) {
    let data = JSON.stringify({
      jql: `project = "${this.projectKey}" AND component in (${components.join(
        ","
      )})`,
      fields: ["components"],
    });

    const maxResults = 50;

    const issuesConfig = {
      method: "post",
      url: `https://${this.cloudName}.atlassian.net/rest/api/3/search`,
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
      maxResults,
    };

    let allIssues = [];

    let issuesResponse;

    let startAt = 0;

    do {
      issuesResponse = await axios.request({ ...issuesConfig, startAt });

      allIssues = allIssues.concat(issuesResponse.data?.issues);

      startAt += maxResults;
    } while (startAt < issuesResponse.data?.total);

    const issuesCount =
      allIssues.reduce((acc, issue) => {
        for (const component of issue?.fields?.components) {
          if (acc?.[component.name] === undefined) {
            acc[component.name] = 0;
          }
          acc[component.name] += 1;
        }
        return acc;
      }, {}) ?? {};

    return issuesCount;
  }
  async execute() {
    try {
      const components = await this.#getComponentsWoLead();

      if (components.length === 0) {
        console.log("No components w/o lead found");
        return;
      }

      const issuesCount = await this.#getIssuesCountByComponent(components);

      this.renderFunction(issuesCount);
    } catch (error) {
      console.log(
        `Error: ${error.message} ${
          error?.response?.data?.errorMessages
            ? error.response.data.errorMessages.join(",")
            : ""
        }`
      );
    }
  }
}

const cloudName = process.env.CLOUD_NAME ?? "herocoders";
const projectKey = process.env.PROJECT_KEY ?? "SP";
const renderTable = (tableData) => {
  if (Object.keys(tableData).length > 0) {
    const table = new Table({
      head: ["Component", "Issues"],
      style: {
        head: [],
        border: [],
      },
    });

    Object.entries(tableData).forEach(([key, value]) => {
      table.push([key, value]);
    });

    console.log("Components w/o lead");
    console.log(table.toString());
  }
};
const componentsAnalyzer = new ComponentsAnalyzer(
  axios,
  renderTable,
  cloudName,
  projectKey
);

componentsAnalyzer.execute();
